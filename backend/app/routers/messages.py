from __future__ import annotations

import asyncio
import base64
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import String, and_, cast, func, or_, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal, get_db, utcnow
from ..mail.sanitize import render_email_html
from ..models import Attachment, Mailbox, Message
from ..schemas import (
    BulkIn,
    DownloadLink,
    HtmlOut,
    MessageDetail,
    MessageList,
    MessageSummary,
    PatchMessageIn,
    RawOut,
    SendEmailIn,
    SendEmailOut,
    message_detail,
    message_summary,
)
from ..deps import mailbox_dep
from ..security import make_download_token
from ..services import delete_message
from ..storage import StorageError, get_storage

router = APIRouter(prefix="/api/mailboxes/{mailbox_id}", tags=["messages"])

RAW_VIEW_LIMIT = 2 * 1024 * 1024


def _parse_dt(value: str | None, name: str, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, f"'{name}' must be an ISO 8601 date or date-time")
    if end_of_day and len(value.strip()) == 10:  # a bare date includes the whole day
        dt = dt + timedelta(days=1) - timedelta(microseconds=1)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _encode_cursor(m: Message) -> str:
    return base64.urlsafe_b64encode(f"{m.received_at.isoformat()}|{m.id}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        ts, mid = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(ts), uuid.UUID(mid)
    except Exception:
        raise HTTPException(400, "Invalid cursor")


def _get_message(db: Session, mb: Mailbox, message_id: uuid.UUID) -> Message:
    msg = db.get(Message, message_id)
    if msg is None or msg.mailbox_id != mb.id:  # never cross mailboxes
        raise HTTPException(404, "Message not found")
    return msg


def _like(col, value: str):
    return func.lower(col).contains(value.strip().lower(), autoescape=True)


def apply_filters(q, *, folder="inbox", text=None, sender=None, recipient=None, subject=None,
                  after=None, before=None, unread=None, has_attachments=None, body=None):
    if folder == "trash":
        q = q.where(Message.deleted_at.is_not(None))
    elif folder == "starred":
        q = q.where(Message.deleted_at.is_(None), Message.is_starred.is_(True))
    elif folder == "sent":
        q = q.where(Message.deleted_at.is_(None), Message.source == "outbound")
    elif folder == "inbox":
        q = q.where(Message.deleted_at.is_(None), Message.source != "outbound")
    if text:
        for term in text.split()[:10]:
            q = q.where(_like(Message.search_text, term))
    if sender:
        q = q.where(or_(_like(Message.from_address, sender), _like(Message.from_name, sender),
                        _like(Message.envelope_from, sender)))
    if recipient:
        q = q.where(or_(_like(cast(Message.to_addrs, String), recipient), _like(cast(Message.cc_addrs, String), recipient),
                        _like(cast(Message.envelope_to, String), recipient)))
    if subject:
        q = q.where(_like(Message.subject, subject))
    if body:
        q = q.where(_like(Message.text_body, body))
    if after:
        q = q.where(Message.received_at >= after)
    if before:
        q = q.where(Message.received_at <= before)
    if unread:
        q = q.where(Message.is_read.is_(False))
    if has_attachments:
        q = q.where(Message.attachment_count > 0)
    return q


@router.get("/messages", response_model=MessageList, response_model_by_alias=True)
def list_messages(
    mb: Mailbox = Depends(mailbox_dep("messages:read")),
    db: Session = Depends(get_db),
    folder: str = Query("inbox", pattern="^(inbox|starred|trash|sent|all)$"),
    q: str | None = Query(None, max_length=200),
    from_: str | None = Query(None, alias="from", max_length=320),
    to: str | None = Query(None, max_length=320),
    subject: str | None = Query(None, max_length=300),
    after: str | None = None,
    before: str | None = None,
    unread: bool | None = None,
    has_attachments: bool | None = None,
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
):
    query = apply_filters(
        select(Message).where(Message.mailbox_id == mb.id), folder=folder, text=q, sender=from_, recipient=to,
        subject=subject, after=_parse_dt(after, "after"), before=_parse_dt(before, "before", end_of_day=True),
        unread=unread, has_attachments=has_attachments,
    )
    if cursor:
        c_time, c_id = _decode_cursor(cursor)
        query = query.where(or_(Message.received_at < c_time, and_(Message.received_at == c_time, Message.id < c_id)))
    rows = list(db.scalars(query.order_by(Message.received_at.desc(), Message.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    rows = rows[:limit]
    return MessageList(
        items=[message_summary(m) for m in rows], next_cursor=_encode_cursor(rows[-1]) if has_more and rows else None
    )


@router.get("/messages/{message_id}", response_model=MessageDetail, response_model_by_alias=True)
def get_message(
    message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:read")), db: Session = Depends(get_db)
):
    msg = _get_message(db, mb, message_id)
    atts = list(db.scalars(select(Attachment).where(Attachment.message_id == msg.id).order_by(Attachment.created_at)))
    return message_detail(msg, atts)


@router.get("/messages/{message_id}/html", response_model=HtmlOut, summary="Sanitised HTML for a sandboxed iframe")
def get_html(
    message_id: uuid.UUID,
    remote_images: bool = False,
    mb: Mailbox = Depends(mailbox_dep("messages:read")),
    db: Session = Depends(get_db),
):
    s = get_settings()
    msg = _get_message(db, mb, message_id)
    if not msg.html_body:
        return HtmlOut(html=None, blocked_remote_images=0, remote_images_loaded=False)
    inline: dict[str, tuple[str, bytes]] = {}
    storage = get_storage()
    for a in db.scalars(
        select(Attachment).where(Attachment.message_id == msg.id, Attachment.content_id.is_not(None),
                                 Attachment.preview_kind == "image")
    ):
        if a.size_bytes > s.max_inline_image_bytes or a.scan_status == "infected":
            continue
        try:
            data = storage.get_bytes(a.storage_key)
        except StorageError:
            continue
        from ..mail.parser import sniff_previewable

        sniff = sniff_previewable(data[:16])
        if sniff and sniff[0] == "image":
            inline[a.content_id.strip("<> ").lower()] = (sniff[1], data)
    r = render_email_html(msg.html_body, inline, remote_images, s.max_inline_image_bytes)
    return HtmlOut(html=r.html, blocked_remote_images=r.blocked_remote_images, remote_images_loaded=r.remote_images_loaded)


@router.get("/messages/{message_id}/raw", response_model=RawOut)
def get_raw(message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:read")), db: Session = Depends(get_db)):
    msg = _get_message(db, mb, message_id)
    if not msg.raw_key:
        raise HTTPException(404, "The original message is no longer available")
    try:
        data = get_storage().get_bytes(msg.raw_key, max_bytes=RAW_VIEW_LIMIT + 1)
    except StorageError:
        raise HTTPException(404, "The original message is no longer available")
    truncated = len(data) > RAW_VIEW_LIMIT
    return RawOut(raw=data[:RAW_VIEW_LIMIT].decode("utf-8", errors="replace"), truncated=truncated, size_bytes=msg.size_bytes)


@router.post("/messages/{message_id}/download-link", response_model=DownloadLink, summary="Link to the original .eml")
def eml_link(message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:read")), db: Session = Depends(get_db)):
    msg = _get_message(db, mb, message_id)
    if not msg.raw_key:
        raise HTTPException(404, "The original message is no longer available")
    stamp = msg.received_at.strftime("%Y%m%d-%H%M%S")
    token = make_download_token(msg.raw_key, f"message-{stamp}-{str(msg.id)[:8]}.eml", "message/rfc822", "attachment")
    return DownloadLink(url=f"/api/download/{token}", expires_in=get_settings().download_link_ttl_seconds)


@router.patch("/messages/{message_id}", response_model=MessageSummary, response_model_by_alias=True)
def patch_message(
    body: PatchMessageIn, message_id: uuid.UUID,
    mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db),
):
    msg = _get_message(db, mb, message_id)
    if body.is_read is not None:
        msg.is_read = body.is_read
    if body.is_starred is not None:
        msg.is_starred = body.is_starred
    db.commit()
    return message_summary(msg)


@router.post("/messages/{message_id}/trash", response_model=MessageSummary, response_model_by_alias=True)
def trash(message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db)):
    msg = _get_message(db, mb, message_id)
    if msg.deleted_at is None:
        msg.deleted_at = utcnow()
        db.commit()
    return message_summary(msg)


@router.post("/messages/{message_id}/restore", response_model=MessageSummary, response_model_by_alias=True)
def restore(message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db)):
    msg = _get_message(db, mb, message_id)
    msg.deleted_at = None
    db.commit()
    return message_summary(msg)


@router.delete("/messages/{message_id}", status_code=204, summary="Permanently delete a message")
def delete_forever(message_id: uuid.UUID, mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db)):
    delete_message(db, _get_message(db, mb, message_id))
    return Response(status_code=204)


@router.post("/messages/bulk")
def bulk(body: BulkIn, mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db)):
    where = and_(Message.mailbox_id == mb.id, Message.id.in_(body.ids))
    if body.action == "delete":
        msgs = list(db.scalars(select(Message).where(where)))
        for m in msgs:
            delete_message(db, m, commit=False)
        db.commit()
        return {"updated": len(msgs)}
    values = {
        "read": {"is_read": True}, "unread": {"is_read": False},
        "star": {"is_starred": True}, "unstar": {"is_starred": False},
        "trash": {"deleted_at": utcnow()}, "restore": {"deleted_at": None},
    }[body.action]
    stmt = update(Message).where(where)
    if body.action == "trash":
        stmt = stmt.where(Message.deleted_at.is_(None))
    res = db.execute(stmt.values(**values).execution_options(synchronize_session=False))
    db.commit()
    return {"updated": res.rowcount or 0}


@router.post("/trash/empty")
def empty_trash(mb: Mailbox = Depends(mailbox_dep("messages:write")), db: Session = Depends(get_db)):
    msgs = list(db.scalars(select(Message).where(Message.mailbox_id == mb.id, Message.deleted_at.is_not(None))))
    for m in msgs:
        delete_message(db, m, commit=False)
    db.commit()
    return {"deleted": len(msgs)}


@router.get(
    "/wait",
    response_model=MessageDetail,
    response_model_by_alias=True,
    summary="Wait (long-poll) for a message matching criteria",
    responses={408: {"description": "No matching message arrived before the timeout"}},
)
async def wait_for_message(
    mb: Mailbox = Depends(mailbox_dep("messages:read")),
    since: str | None = None,
    subject: str | None = Query(None, max_length=300),
    from_: str | None = Query(None, alias="from", max_length=320),
    to: str | None = Query(None, max_length=320),
    body: str | None = Query(None, max_length=300),
    timeout: int = Query(30, ge=1),
):
    s = get_settings()
    timeout = min(timeout, s.wait_max_seconds)
    since_dt = _parse_dt(since, "since")
    mailbox_pk = mb.id

    def find():
        db = SessionLocal()
        try:
            q = apply_filters(
                select(Message).where(Message.mailbox_id == mailbox_pk), folder="inbox",
                sender=from_, recipient=to, subject=subject, body=body, after=since_dt,
            )
            msg = db.scalars(q.order_by(Message.received_at.asc(), Message.id.asc()).limit(1)).first()
            if msg is None:
                return None
            atts = list(db.scalars(select(Attachment).where(Attachment.message_id == msg.id)))
            return message_detail(msg, atts)
        finally:
            db.close()

    deadline = time.monotonic() + timeout
    while True:
        found = await run_in_threadpool(find)
        if found is not None:
            return found
        if time.monotonic() >= deadline:
            raise HTTPException(408, f"No matching message arrived within {timeout}s")
        await asyncio.sleep(min(1.0, max(0.1, deadline - time.monotonic())))


@router.post("/send", response_model=SendEmailOut)
def send_email(
    payload: SendEmailIn,
    mb: Mailbox = Depends(mailbox_dep("messages:write")),
    db: Session = Depends(get_db),
):
    """Send an email from this mailbox to an internal or external recipient."""
    from ..outbound import dispatch_outbound_email

    try:
        ok, details, sent_record = dispatch_outbound_email(
            db=db,
            sender_mailbox=mb,
            to_address=payload.to,
            subject=payload.subject,
            text_body=payload.text_body,
            html_body=payload.html_body,
        )
        return SendEmailOut(
            success=ok,
            message_id=sent_record.id,
            delivery_status="sent" if ok else "queued",
            sent_to=payload.to,
            details=details,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Sending failed: {e}")

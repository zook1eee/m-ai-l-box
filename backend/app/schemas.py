"""API request/response models and ORM → API converters."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from .models import ApiKey, Attachment, Mailbox, Message, StoredFile, User


class AddressOut(BaseModel):
    name: str | None = None
    address: str


class MailboxOut(BaseModel):
    id: uuid.UUID
    address: str
    local_part: str
    domain: str
    label: str | None
    created_at: datetime
    expires_at: datetime | None
    is_saved: bool
    is_demo: bool
    disabled: bool
    message_count: int = 0
    unread_count: int = 0
    storage_bytes: int = 0
    token_hint: str


class MailboxWithToken(BaseModel):
    mailbox: MailboxOut
    token: str


class MailboxEnvelope(BaseModel):
    mailbox: MailboxOut


class CreateMailboxIn(BaseModel):
    domain: str | None = Field(default=None, max_length=253)
    local_part: str | None = Field(default=None, max_length=64)
    label: str | None = Field(default=None, max_length=120)
    save: bool = False


class OpenMailboxIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class PatchMailboxIn(BaseModel):
    label: str | None = Field(default=None, max_length=120)


class OtpOut(BaseModel):
    code: str
    context: str


class LinkOut(BaseModel):
    url: str
    text: str | None = None
    source: str


class HeaderOut(BaseModel):
    name: str
    value: str


class AttachmentOut(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    is_inline: bool
    content_id: str | None
    scan_status: str
    previewable: Literal["image", "pdf"] | None
    created_at: datetime


class AttachmentListItem(AttachmentOut):
    message_subject: str
    message_from: AddressOut | None
    received_at: datetime


class MessageSummary(BaseModel):
    id: uuid.UUID
    mailbox_id: uuid.UUID
    subject: str
    from_: AddressOut | None = Field(alias="from", serialization_alias="from")
    to: list[AddressOut]
    snippet: str
    received_at: datetime
    sent_at: datetime | None
    is_read: bool
    is_starred: bool
    in_trash: bool
    deleted_at: datetime | None
    has_attachments: bool
    attachment_count: int
    size_bytes: int
    has_otp: bool
    is_demo: bool
    is_sent: bool = False

    model_config = {"populate_by_name": True}


class SendEmailIn(BaseModel):
    to: str = Field(min_length=3, max_length=320)
    subject: str = Field(default="(No subject)", max_length=300)
    text_body: str = Field(default="", max_length=200_000)
    html_body: str | None = Field(default=None, max_length=500_000)


class SendEmailOut(BaseModel):
    success: bool
    message_id: uuid.UUID
    delivery_status: str
    sent_to: str
    details: str | None = None


class MessageDetail(MessageSummary):
    cc: list[AddressOut]
    reply_to: list[AddressOut]
    envelope_from: str | None
    envelope_to: list[str]
    message_id_header: str | None
    text_body: str
    has_html: bool
    headers: list[HeaderOut]
    attachments: list[AttachmentOut]
    otp_codes: list[OtpOut]
    links: list[LinkOut]
    delivery_source: str


class MessageList(BaseModel):
    items: list[MessageSummary]
    next_cursor: str | None


class PatchMessageIn(BaseModel):
    is_read: bool | None = None
    is_starred: bool | None = None


class BulkIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    action: Literal["read", "unread", "star", "unstar", "trash", "restore", "delete"]


class HtmlOut(BaseModel):
    html: str | None
    blocked_remote_images: int
    remote_images_loaded: bool


class RawOut(BaseModel):
    raw: str
    truncated: bool
    size_bytes: int


class DownloadLink(BaseModel):
    url: str
    expires_in: int


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    is_admin: bool
    created_at: datetime


class UsageOut(BaseModel):
    used_bytes: int
    quota_bytes: int
    messages_bytes: int
    files_bytes: int


class AuthOut(BaseModel):
    user: UserOut
    token: str


class MeOut(BaseModel):
    user: UserOut
    usage: UsageOut


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=256)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class DeleteAccountIn(BaseModel):
    password: str = Field(max_length=256)


class FileOut(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    scan_status: str
    source: str
    previewable: Literal["image", "pdf"] | None


class RenameFileIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    scopes: list[str]
    mailbox_id: uuid.UUID | None
    created_at: datetime
    last_used_at: datetime | None


class CreateApiKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(min_length=1)
    mailbox_id: uuid.UUID | None = None


class CreateMailboxKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=lambda: ["messages:read", "attachments:read"])


class ApiKeyCreated(BaseModel):
    api_key: ApiKeyOut
    key: str


# --------------------------------------------------------------------------- converters

def addr(name: str | None, address: str | None) -> AddressOut | None:
    return AddressOut(name=name, address=address) if address else None


def mailbox_out(mb: Mailbox, message_count: int = 0, unread_count: int = 0, storage_bytes: int = 0) -> MailboxOut:
    return MailboxOut(
        id=mb.id, address=mb.address, local_part=mb.local_part, domain=mb.domain, label=mb.label,
        created_at=mb.created_at, expires_at=mb.expires_at if mb.owner_user_id is None else None,
        is_saved=mb.owner_user_id is not None, is_demo=mb.is_demo, disabled=mb.disabled,
        message_count=message_count, unread_count=unread_count, storage_bytes=storage_bytes,
        token_hint=mb.token_hint,
    )


def message_summary(m: Message) -> MessageSummary:
    return MessageSummary(
        id=m.id, mailbox_id=m.mailbox_id, subject=m.subject,
        from_=addr(m.from_name, m.from_address),
        to=[AddressOut(**a) for a in (m.to_addrs or [])],
        snippet=m.snippet, received_at=m.received_at, sent_at=m.sent_at,
        is_read=m.is_read, is_starred=m.is_starred, in_trash=m.deleted_at is not None,
        deleted_at=m.deleted_at, has_attachments=m.attachment_count > 0,
        attachment_count=m.attachment_count, size_bytes=m.size_bytes,
        has_otp=bool(m.otp_codes), is_demo=m.is_demo,
        is_sent=m.source == "outbound",
    )


def attachment_out(a: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=a.id, message_id=a.message_id, filename=a.filename, content_type=a.content_type,
        size_bytes=a.size_bytes, is_inline=a.is_inline, content_id=a.content_id,
        scan_status=a.scan_status, previewable=a.preview_kind, created_at=a.created_at,
    )


def message_detail(m: Message, attachments: list[Attachment]) -> MessageDetail:
    base = message_summary(m).model_dump(by_alias=False)
    return MessageDetail(
        **base,
        cc=[AddressOut(**a) for a in (m.cc_addrs or [])],
        reply_to=[AddressOut(**a) for a in (m.reply_to or [])],
        envelope_from=m.envelope_from, envelope_to=m.envelope_to or [],
        message_id_header=m.message_id_header, text_body=m.text_body, has_html=bool(m.html_body),
        headers=[HeaderOut(**h) for h in (m.headers or [])],
        attachments=[attachment_out(a) for a in attachments],
        otp_codes=[OtpOut(**o) for o in (m.otp_codes or [])],
        links=[LinkOut(**link) for link in (m.links or [])],
        delivery_source=m.source,
    )


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, is_admin=u.is_admin, created_at=u.created_at)


def file_out(f: StoredFile) -> FileOut:
    return FileOut(
        id=f.id, filename=f.filename, content_type=f.content_type, size_bytes=f.size_bytes,
        created_at=f.created_at, scan_status=f.scan_status, source=f.source, previewable=f.preview_kind,
    )


def api_key_out(k: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=k.id, name=k.name, prefix=k.prefix, scopes=list(k.scopes or []), mailbox_id=k.mailbox_id,
        created_at=k.created_at, last_used_at=k.last_used_at,
    )

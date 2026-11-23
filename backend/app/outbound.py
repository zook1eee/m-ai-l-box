"""Outbound email dispatcher supporting local loopback delivery and SMTP relay."""
from __future__ import annotations

import email.message
import email.utils
import logging
import smtplib
import ssl
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy.orm import Session

from .config import get_settings
from .db import utcnow
from .mail.ingest import accept_delivery, process_delivery, split_address
from .mail.parser import make_snippet
from .models import Mailbox, Message

log = logging.getLogger(__name__)


def build_mime_message(
    from_address: str,
    to_address: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> tuple[bytes, str]:
    """Construct a standard MIME email with Message-ID and timestamps."""
    msg_id = f"<{uuid.uuid4()}@{from_address.split('@')[-1]}>"
    now_dt = datetime.now(timezone.utc)
    date_str = email.utils.format_datetime(now_dt)

    if html_body:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_address
        msg["To"] = to_address
        msg["Date"] = date_str
        msg["Message-ID"] = msg_id

        part_text = MIMEText(text_body or "", "plain", "utf-8")
        part_html = MIMEText(html_body, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)
    else:
        msg = MIMEText(text_body or "", "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = from_address
        msg["To"] = to_address
        msg["Date"] = date_str
        msg["Message-ID"] = msg_id

    raw_bytes = msg.as_bytes()
    return raw_bytes, msg_id


def send_via_smtp_relay(
    from_address: str,
    to_address: str,
    raw_bytes: bytes,
) -> tuple[bool, str]:
    """Deliver email via configured outbound SMTP relay (Resend, SendGrid, Gmail, etc)."""
    s = get_settings()
    if not s.smtp_outbound_host:
        return False, "Outbound SMTP relay not configured. Set SMTP_OUTBOUND_HOST in .env"

    try:
        if s.smtp_outbound_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(s.smtp_outbound_host, s.smtp_outbound_port, context=context, timeout=15) as client:
                if s.smtp_outbound_user and s.smtp_outbound_password:
                    client.login(s.smtp_outbound_user, s.smtp_outbound_password)
                client.sendmail(from_address, [to_address], raw_bytes)
        else:
            with smtplib.SMTP(s.smtp_outbound_host, s.smtp_outbound_port, timeout=15) as client:
                if s.smtp_outbound_starttls:
                    context = ssl.create_default_context()
                    client.starttls(context=context)
                if s.smtp_outbound_user and s.smtp_outbound_password:
                    client.login(s.smtp_outbound_user, s.smtp_outbound_password)
                client.sendmail(from_address, [to_address], raw_bytes)

        return True, "Delivered via external SMTP relay"
    except Exception as exc:
        log.exception("Outbound SMTP dispatch failed")
        return False, f"SMTP relay error: {exc}"


def record_sent_message(
    db: Session,
    sender_mailbox: Mailbox,
    to_address: str,
    subject: str,
    text_body: str,
    html_body: str | None,
    raw_bytes: bytes,
    msg_id_header: str,
) -> Message:
    """Store a copy of the sent email in the sender's mailbox with source='outbound'."""
    now = utcnow()
    snippet = make_snippet(text_body, html_body or "")

    sent_msg = Message(
        mailbox_id=sender_mailbox.id,
        dedupe_key=f"sent_{uuid.uuid4().hex[:24]}",
        message_id_header=msg_id_header,
        subject=subject or "(No subject)",
        from_name=sender_mailbox.label or sender_mailbox.local_part,
        from_address=sender_mailbox.address,
        to_addrs=[{"address": to_address.strip(), "name": None}],
        envelope_from=sender_mailbox.address,
        envelope_to=[to_address.strip()],
        sent_at=now,
        received_at=now,
        size_bytes=len(raw_bytes),
        text_body=text_body or "",
        html_body=html_body,
        snippet=snippet,
        headers=[
            {"name": "From", "value": sender_mailbox.address},
            {"name": "To", "value": to_address},
            {"name": "Subject", "value": subject},
            {"name": "Message-ID", "value": msg_id_header},
        ],
        search_text=f"{subject}\n{to_address}\n{text_body}".lower(),
        source="outbound",
        is_read=True,
    )
    db.add(sent_msg)
    db.commit()
    db.refresh(sent_msg)
    return sent_msg


def dispatch_outbound_email(
    db: Session,
    sender_mailbox: Mailbox,
    to_address: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> tuple[bool, str, Message]:
    """High-level dispatch: route internally if recipient is local, otherwise relay via SMTP."""
    s = get_settings()
    target = to_address.strip().lower()
    parts = split_address(target)
    if not parts:
        raise ValueError("Invalid recipient email address")

    _, target_domain = parts
    raw_bytes, msg_id_header = build_mime_message(
        sender_mailbox.address, target, subject, text_body, html_body
    )

    # 1. Local / Internal Loopback: If target domain is handled by this instance
    if target_domain in s.receiving_domains or target_domain in ("localhost", "localhost.test", "mailbox.localhost"):
        accept_res = accept_delivery(
            db=db,
            raw=raw_bytes,
            recipients=[target],
            mail_from=sender_mailbox.address,
            source="outbound",
            remote_ip="127.0.0.1",
        )
        if accept_res.accepted and accept_res.delivery_id:
            process_delivery(accept_res.delivery_id, final_attempt=True)
            sent_record = record_sent_message(
                db, sender_mailbox, target, subject, text_body, html_body, raw_bytes, msg_id_header
            )
            return True, "Delivered to local mailbox", sent_record
        else:
            reason = accept_res.rejected.get(target, accept_res.error or "delivery refused")
            raise ValueError(f"Local delivery failed: {reason}")

    # 2. External Outbound Relay
    if not s.smtp_outbound_enabled and not s.smtp_outbound_host:
        # Save to Sent anyway so user can preview, but report warning
        sent_record = record_sent_message(
            db, sender_mailbox, target, subject, text_body, html_body, raw_bytes, msg_id_header
        )
        return (
            False,
            "Outbound relay not configured. The message was saved to Sent, but to deliver to external domains like Gmail, configure SMTP_OUTBOUND_HOST in .env.",
            sent_record,
        )

    ok, details = send_via_smtp_relay(sender_mailbox.address, target, raw_bytes)
    sent_record = record_sent_message(
        db, sender_mailbox, target, subject, text_body, html_body, raw_bytes, msg_id_header
    )
    return ok, details, sent_record


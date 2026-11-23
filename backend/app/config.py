"""Application settings, read from environment variables (see .env.example)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MB = 1024 * 1024


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "M-Ai-L Box"
    tagline: str = "Built for developers. Ready for testers."
    environment: Literal["development", "production", "test"] = "development"

    # Secrets — must be set in production
    secret_key: str = Field(default="dev-insecure-change-me", min_length=16)

    # Infrastructure
    database_url: str = "postgresql+psycopg://mailbox:mailbox@localhost:5432/mailbox"
    redis_url: str | None = "redis://localhost:6379/0"
    storage_backend: Literal["s3", "local"] = "s3"
    storage_local_path: str = "./data/objects"
    s3_endpoint_url: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_bucket: str = "mailbox"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_create_bucket: bool = False

    # Receiving
    receiving_domains: list[str] = ["localhost.test"]
    inbound_adapters: list[Literal["smtp", "cloudflare", "mailgun"]] = ["smtp"]
    unknown_recipient_policy: Literal["reject", "discard"] = "reject"
    smtp_host: str = "0.0.0.0"
    smtp_port: int = 2525
    smtp_hostname: str = "localhost"
    smtp_tls_cert: str | None = None
    smtp_tls_key: str | None = None
    smtp_max_recipients: int = 50
    inbound_webhook_secret: str | None = None  # shared HMAC secret for /api/inbound/raw
    inbound_webhook_tolerance_seconds: int = 300
    mailgun_webhook_signing_key: str | None = None
    mailgun_timestamp_tolerance_seconds: int = 12 * 3600  # Mailgun retries for up to 8 h
    process_inline: bool = False  # process deliveries in-process instead of Celery (tests / lite dev)

    # Outbound Relay (Sending)
    smtp_outbound_enabled: bool = False
    smtp_outbound_host: str | None = None
    smtp_outbound_port: int = 587
    smtp_outbound_user: str | None = None
    smtp_outbound_password: str | None = None
    smtp_outbound_starttls: bool = True
    smtp_outbound_ssl: bool = False

    # Limits
    max_message_bytes: int = 25 * MB
    max_upload_bytes: int = 25 * MB
    max_attachment_preview_bytes: int = 15 * MB
    max_inline_image_bytes: int = 2 * MB
    max_html_bytes: int = 5 * MB
    temp_mailbox_max_messages: int = 200
    temp_mailbox_quota_bytes: int = 100 * MB
    user_quota_bytes: int = 1024 * MB
    custom_local_part_allowed: bool = True

    # Retention
    temp_mailbox_ttl_hours: int = 24
    trash_retention_days: int = 7
    saved_message_retention_days: int = 0  # 0 = keep until deleted
    delivery_log_retention_days: int = 14

    # Accounts
    accounts_enabled: bool = True
    registration_open: bool = True
    session_ttl_days: int = 30

    # Rate limits (per window)
    rl_mailbox_create_per_hour: int = 20
    rl_api_per_minute: int = 300
    rl_auth_per_minute: int = 10
    rl_inbound_per_mailbox_per_hour: int = 300
    rl_inbound_per_ip_per_minute: int = 120
    rl_upload_per_hour: int = 120
    trust_proxy_headers: bool = False

    # Misc
    download_link_ttl_seconds: int = 120
    wait_max_seconds: int = 120
    demo_mode: bool = False
    scanner: Literal["none", "clamav"] = "none"
    clamav_host: str = "clamav"
    clamav_port: int = 3310
    cors_origins: list[str] = []
    frontend_dist: str | None = None  # serve the built SPA from this folder when set
    log_level: str = "INFO"

    @field_validator("receiving_domains", mode="after")
    @classmethod
    def _lower(cls, v: list[str]) -> list[str]:
        return [x.strip().lower() for x in v if x.strip()]

    @property
    def default_domain(self) -> str:
        return self.receiving_domains[0]


@lru_cache
def get_settings() -> Settings:
    return Settings()

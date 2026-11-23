// Types mirroring docs/API.md. Keep in sync with the backend contract.

export interface Mailbox {
  id: string;
  address: string;
  local_part: string;
  domain: string;
  label: string | null;
  created_at: string;
  /** null = saved to an account (no expiry) */
  expires_at: string | null;
  is_saved: boolean;
  is_demo: boolean;
  disabled: boolean;
  message_count: number;
  unread_count: number;
  storage_bytes: number;
  token_hint: string;
}

export interface Address {
  name: string | null;
  address: string;
}

export interface MessageSummary {
  id: string;
  mailbox_id: string;
  subject: string;
  from: Address | null;
  to: Address[];
  snippet: string;
  received_at: string;
  sent_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  in_trash: boolean;
  deleted_at: string | null;
  has_attachments: boolean;
  attachment_count: number;
  size_bytes: number;
  has_otp: boolean;
  is_demo: boolean;
  is_sent?: boolean;
}

export interface SendEmailPayload {
  to: string;
  subject?: string;
  text_body: string;
  html_body?: string;
}

export interface SendEmailResult {
  success: boolean;
  message_id: string;
  delivery_status: string;
  sent_to: string;
  details?: string;
}

export type ScanStatus = 'not_scanned' | 'pending' | 'clean' | 'infected' | 'error';
export type Previewable = 'image' | 'pdf' | null;

export interface Attachment {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  is_inline: boolean;
  content_id: string | null;
  scan_status: ScanStatus;
  previewable: Previewable;
  created_at: string;
}

export interface AttachmentListItem extends Attachment {
  message_subject: string;
  message_from: Address | null;
  received_at: string;
}

export interface OtpCode {
  code: string;
  context: string;
}

export interface MessageLink {
  url: string;
  text: string | null;
  source: 'html' | 'text';
}

export interface Header {
  name: string;
  value: string;
}

export interface MessageDetail extends MessageSummary {
  cc: Address[];
  reply_to: Address[];
  envelope_from: string | null;
  envelope_to: string[];
  message_id_header: string | null;
  text_body: string;
  has_html: boolean;
  headers: Header[];
  attachments: Attachment[];
  otp_codes: OtpCode[];
  links: MessageLink[];
  delivery_source: 'smtp' | 'cloudflare' | 'mailgun' | 'demo' | string;
}

export interface HtmlBody {
  html: string | null;
  blocked_remote_images: number;
  remote_images_loaded: boolean;
}

export interface RawSource {
  raw: string;
  truncated: boolean;
  size_bytes: number;
}

export interface DownloadLink {
  url: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface Usage {
  used_bytes: number;
  quota_bytes: number;
  messages_bytes: number;
  files_bytes: number;
}

export interface StoredFile {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  scan_status: ScanStatus;
  source: 'upload' | 'attachment';
  previewable: Previewable;
}

export type ApiScope = 'mailboxes:create' | 'messages:read' | 'messages:write' | 'attachments:read';
export const ALL_SCOPES: ApiScope[] = ['mailboxes:create', 'messages:read', 'messages:write', 'attachments:read'];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  mailbox_id: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface Health {
  status: 'ok' | 'degraded' | string;
  checks: Record<string, string>;
}

export interface AppConfig {
  app_name: string;
  tagline: string;
  domains: string[];
  default_domain: string;
  demo_mode: boolean;
  inbound_adapters: string[];
  accounts_enabled: boolean;
  registration_open: boolean;
  custom_local_part_allowed: boolean;
  temp_mailbox_ttl_hours: number;
  trash_retention_days: number;
  /** 0 = keep until deleted */
  saved_message_retention_days: number;
  temp_mailbox_max_messages: number;
  max_message_bytes: number;
  max_upload_bytes: number;
  user_quota_bytes: number;
  scanner: 'none' | 'clamav' | string;
  wait_max_seconds: number;
}

export interface MailboxWithToken {
  mailbox: Mailbox;
  token: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export interface MeResult {
  user: User;
  usage: Usage;
}

export type Folder = 'inbox' | 'sent' | 'starred' | 'trash' | 'all';

export type BulkAction = 'read' | 'unread' | 'star' | 'unstar' | 'trash' | 'restore' | 'delete';

export interface MessageQuery {
  folder?: Folder;
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  after?: string;
  before?: string;
  unread?: boolean;
  has_attachments?: boolean;
  limit?: number;
  cursor?: string;
}

export type AttachmentSort = 'received' | 'name' | 'size' | 'type';
export type FileSort = 'created' | 'name' | 'size' | 'type';
export type SortOrder = 'asc' | 'desc';

// ---- Admin ----

export type DeliveryStatus = 'failed' | 'queued' | 'processing' | 'processed' | 'rejected';

export interface AdminDelivery {
  id: string;
  source: string;
  status: DeliveryStatus | string;
  attempts: number;
  last_error: string | null;
  size_bytes: number;
  recipient_domains: string[];
  recipient_count: number;
  matched_count: number;
  received_at: string;
  processed_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
  quota_bytes: number;
  used_bytes: number;
  mailbox_count: number;
}

export type BlockKind = 'sender' | 'sender_domain' | 'ip' | 'mailbox';

export interface AdminBlock {
  id: string;
  kind: BlockKind;
  value: string;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
}

/** The overview shape is loosely specified; it is rendered generically. */
export type AdminOverview = Record<string, unknown>;

// ---- Live events ----

export interface StateEvent {
  message_count: number;
  unread_count: number;
}

export interface NewMessageEvent {
  id: string;
  received_at: string;
  subject: string;
}

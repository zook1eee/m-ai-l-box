// One function per REST endpoint in docs/API.md.
import { apiRequest, uploadWithProgress } from './client';
import type {
  AdminBlock,
  AdminDelivery,
  AdminOverview,
  AdminUser,
  ApiKey,
  ApiScope,
  AppConfig,
  AttachmentListItem,
  AttachmentSort,
  AuthResult,
  BlockKind,
  BulkAction,
  DownloadLink,
  FileSort,
  Health,
  HtmlBody,
  Mailbox,
  MailboxWithToken,
  MeResult,
  MessageDetail,
  MessageQuery,
  MessageSummary,
  Page,
  RawSource,
  SortOrder,
  StoredFile,
} from './types';

const enc = encodeURIComponent;
const mbxPath = (id: string) => `/mailboxes/${enc(id)}`;
const msgPath = (id: string, mid: string) => `${mbxPath(id)}/messages/${enc(mid)}`;

// ---- Public ----
export const getConfig = (signal?: AbortSignal) => apiRequest<AppConfig>('/config', { signal, noSession: true });
export const getHealth = () => apiRequest<Health>('/health', { noSession: true });

// ---- Mailboxes ----
export const createMailbox = (body: { domain?: string; local_part?: string; label?: string; save?: boolean }) =>
  apiRequest<MailboxWithToken>('/mailboxes', { method: 'POST', body, noSession: !body.save });

export const openMailbox = (token: string) =>
  apiRequest<{ mailbox: Mailbox }>('/mailboxes/open', { method: 'POST', body: { token }, noSession: true });

export const getMailbox = (id: string, signal?: AbortSignal) => apiRequest<Mailbox>(mbxPath(id), { mailboxId: id, signal });

export const updateMailbox = (id: string, label: string | null) =>
  apiRequest<Mailbox>(mbxPath(id), { method: 'PATCH', body: { label }, mailboxId: id });

export const deleteMailbox = (id: string) => apiRequest<void>(mbxPath(id), { method: 'DELETE', mailboxId: id });

export const claimMailbox = (id: string) => apiRequest<Mailbox>(`${mbxPath(id)}/claim`, { method: 'POST', mailboxId: id });

export const releaseMailbox = (id: string) => apiRequest<Mailbox>(`${mbxPath(id)}/release`, { method: 'POST', mailboxId: id });

export const rotateMailboxToken = (id: string) =>
  apiRequest<MailboxWithToken>(`${mbxPath(id)}/rotate-token`, { method: 'POST', mailboxId: id });

export const getMyMailboxes = (signal?: AbortSignal) => apiRequest<{ items: Mailbox[] }>('/me/mailboxes', { signal });

export const createDemoMailbox = () => apiRequest<MailboxWithToken>('/demo/mailbox', { method: 'POST', noSession: true });

// ---- Messages ----
export const listMessages = (id: string, q: MessageQuery, signal?: AbortSignal) =>
  apiRequest<Page<MessageSummary>>(`${mbxPath(id)}/messages`, {
    mailboxId: id,
    signal,
    query: {
      folder: q.folder,
      q: q.q,
      from: q.from,
      to: q.to,
      subject: q.subject,
      after: q.after,
      before: q.before,
      unread: q.unread ? 'true' : undefined,
      has_attachments: q.has_attachments ? 'true' : undefined,
      limit: q.limit,
      cursor: q.cursor,
    },
  });

export const getMessage = (id: string, mid: string, signal?: AbortSignal) =>
  apiRequest<MessageDetail>(msgPath(id, mid), { mailboxId: id, signal });

export const getMessageHtml = (id: string, mid: string, remoteImages: boolean, signal?: AbortSignal) =>
  apiRequest<HtmlBody>(`${msgPath(id, mid)}/html`, {
    mailboxId: id,
    signal,
    query: { remote_images: remoteImages ? 'true' : 'false' },
  });

export const getMessageRaw = (id: string, mid: string, signal?: AbortSignal) =>
  apiRequest<RawSource>(`${msgPath(id, mid)}/raw`, { mailboxId: id, signal });

export const getMessageDownloadLink = (id: string, mid: string) =>
  apiRequest<DownloadLink>(`${msgPath(id, mid)}/download-link`, { method: 'POST', mailboxId: id });

export const patchMessage = (id: string, mid: string, body: { is_read?: boolean; is_starred?: boolean }) =>
  apiRequest<MessageSummary>(msgPath(id, mid), { method: 'PATCH', body, mailboxId: id });

export const trashMessage = (id: string, mid: string) =>
  apiRequest<MessageSummary>(`${msgPath(id, mid)}/trash`, { method: 'POST', mailboxId: id });

export const restoreMessage = (id: string, mid: string) =>
  apiRequest<MessageSummary>(`${msgPath(id, mid)}/restore`, { method: 'POST', mailboxId: id });

export const deleteMessage = (id: string, mid: string) => apiRequest<void>(msgPath(id, mid), { method: 'DELETE', mailboxId: id });

export const sendEmail = (id: string, body: { to: string; subject?: string; text_body: string; html_body?: string }) =>
  apiRequest<{ success: boolean; message_id: string; delivery_status: string; sent_to: string; details?: string }>(
    `${mbxPath(id)}/send`,
    { method: 'POST', body, mailboxId: id },
  );

export const bulkMessages = (id: string, ids: string[], action: BulkAction) =>
  apiRequest<{ updated: number }>(`${mbxPath(id)}/messages/bulk`, { method: 'POST', body: { ids, action }, mailboxId: id });

export const emptyTrash = (id: string) =>
  apiRequest<{ deleted: number }>(`${mbxPath(id)}/trash/empty`, { method: 'POST', mailboxId: id });

// ---- Attachments ----
export const listAttachments = (
  id: string,
  q: { q?: string; sort?: AttachmentSort; order?: SortOrder; cursor?: string; limit?: number },
  signal?: AbortSignal,
) =>
  apiRequest<Page<AttachmentListItem>>(`${mbxPath(id)}/attachments`, {
    mailboxId: id,
    signal,
    query: { q: q.q, sort: q.sort, order: q.order, cursor: q.cursor, limit: q.limit, include_inline: 'false' },
  });

export const getAttachmentDownloadLink = (id: string, aid: string, disposition: 'attachment' | 'inline') =>
  apiRequest<DownloadLink>(`${mbxPath(id)}/attachments/${enc(aid)}/download-link`, {
    method: 'POST',
    mailboxId: id,
    query: { disposition },
  });

export const saveAttachmentToFiles = (id: string, aid: string) =>
  apiRequest<StoredFile>(`${mbxPath(id)}/attachments/${enc(aid)}/save-to-files`, { method: 'POST', mailboxId: id });

// ---- Accounts ----
export const register = (email: string, password: string) =>
  apiRequest<AuthResult>('/auth/register', { method: 'POST', body: { email, password }, noSession: true });

export const login = (email: string, password: string) =>
  apiRequest<AuthResult>('/auth/login', { method: 'POST', body: { email, password }, noSession: true });

export const logout = () => apiRequest<void>('/auth/logout', { method: 'POST' });

export const getMe = (signal?: AbortSignal) => apiRequest<MeResult>('/auth/me', { signal });

export const changePassword = (current_password: string, new_password: string) =>
  apiRequest<void>('/auth/change-password', { method: 'POST', body: { current_password, new_password } });

export const deleteAccount = (password: string) => apiRequest<void>('/auth/me', { method: 'DELETE', body: { password } });

// ---- Personal files ----
export const listFiles = (q: { q?: string; sort?: FileSort; order?: SortOrder }, signal?: AbortSignal) =>
  apiRequest<Page<StoredFile>>('/files', { query: q, signal });

export const uploadFile = (file: File, onProgress: (f: number) => void, signal?: AbortSignal) => {
  const fd = new FormData();
  fd.append('file', file, file.name);
  return uploadWithProgress<StoredFile>('/files', fd, onProgress, signal);
};

export const renameFile = (fid: string, filename: string) =>
  apiRequest<StoredFile>(`/files/${enc(fid)}`, { method: 'PATCH', body: { filename } });

export const getFileDownloadLink = (fid: string, disposition: 'attachment' | 'inline') =>
  apiRequest<DownloadLink>(`/files/${enc(fid)}/download-link`, { method: 'POST', query: { disposition } });

export const deleteFile = (fid: string) => apiRequest<void>(`/files/${enc(fid)}`, { method: 'DELETE' });

// ---- API keys ----
export const listApiKeys = (signal?: AbortSignal) => apiRequest<{ items: ApiKey[] }>('/api-keys', { signal });

export const createApiKey = (body: { name: string; scopes: ApiScope[]; mailbox_id?: string }) =>
  apiRequest<{ api_key: ApiKey; key: string }>('/api-keys', { method: 'POST', body });

export const listMailboxApiKeys = (id: string, signal?: AbortSignal) =>
  apiRequest<{ items: ApiKey[] }>(`${mbxPath(id)}/api-keys`, { mailboxId: id, signal });

export const createMailboxApiKey = (id: string, body: { name: string; scopes: ApiScope[] }) =>
  apiRequest<{ api_key: ApiKey; key: string }>(`${mbxPath(id)}/api-keys`, { method: 'POST', body, mailboxId: id });

/** Revoke a key. Pass mailboxId to authenticate with that mailbox's token. */
export const deleteApiKey = (kid: string, mailboxId?: string) =>
  apiRequest<void>(`/api-keys/${enc(kid)}`, { method: 'DELETE', mailboxId });

// ---- Admin ----
export const adminOverview = (signal?: AbortSignal) => apiRequest<AdminOverview>('/admin/overview', { signal });

export const adminDeliveries = (status: string, cursor?: string, signal?: AbortSignal) =>
  apiRequest<Page<AdminDelivery>>('/admin/deliveries', { query: { status, limit: 50, cursor }, signal });

export const adminRetryDelivery = (did: string) => apiRequest<unknown>(`/admin/deliveries/${enc(did)}/retry`, { method: 'POST' });

export const adminUsers = (q: string, signal?: AbortSignal) => apiRequest<{ items: AdminUser[] }>('/admin/users', { query: { q }, signal });

export const adminPatchUser = (uid: string, body: { quota_bytes?: number; disabled?: boolean; is_admin?: boolean }) =>
  apiRequest<unknown>(`/admin/users/${enc(uid)}`, { method: 'PATCH', body });

export const adminBlocks = (signal?: AbortSignal) => apiRequest<{ items: AdminBlock[] }>('/admin/blocks', { signal });

export const adminAddBlock = (body: { kind: BlockKind; value: string; reason?: string; expires_at?: string }) =>
  apiRequest<AdminBlock>('/admin/blocks', { method: 'POST', body });

export const adminDeleteBlock = (bid: string) => apiRequest<void>(`/admin/blocks/${enc(bid)}`, { method: 'DELETE' });

export const adminDisableMailbox = (address: string, disabled: boolean) =>
  apiRequest<{ address: string; disabled: boolean }>('/admin/mailboxes/disable', { method: 'POST', body: { address, disabled } });

export const adminCleanup = () => apiRequest<Record<string, unknown>>('/admin/cleanup', { method: 'POST' });

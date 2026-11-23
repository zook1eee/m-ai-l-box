import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, errorMessage, isAbort } from '../api/client';
import * as api from '../api/endpoints';
import type { BulkAction, Folder, MessageSummary } from '../api/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CopyButton } from '../components/CopyButton';
import { DemoBanner } from '../components/DemoBanner';
import { EmptyState, InfoBanner } from '../components/Feedback';
import { IconInbox, IconMail, IconMailOpen, IconRestore, IconSearch, IconStar, IconTrash, IconX } from '../components/Icons';
import { btnSecondary, btnSmall, checkbox, iconBtn } from '../components/ui';
import { useConfig } from '../context/ConfigContext';
import { useMailboxes, type KnownMailbox } from '../context/MailboxContext';
import { useToast } from '../context/ToastContext';
import { useUi } from '../context/UiContext';
import { cx } from '../lib/cx';
import { pluralize } from '../lib/format';
import { shouldIgnoreShortcut } from '../lib/keys';
import { MessageList } from './MessageList';
import { MessageReader, type ReaderHandle } from './MessageReader';
import { isSearchActive, toQuery, type SearchState } from './search';

const PAGE_SIZE = 50;

interface MailViewProps {
  mailbox: KnownMailbox;
  folder: Exclude<Folder, 'all'>;
  messageId: string | null;
  search: SearchState;
  onClearSearch: () => void;
  /** Increments when the list should be refreshed silently (live updates, refresh button). */
  refreshSignal: number;
  onOpen: (messageId: string | null) => void;
}

const FOLDER_LABEL: Record<MailViewProps['folder'], string> = { inbox: 'Inbox', sent: 'Sent', starred: 'Starred', trash: 'Trash' };

export function MailView({ mailbox, folder, messageId, search, onClearSearch, refreshSignal, onOpen }: MailViewProps) {
  const config = useConfig();
  const { toast } = useToast();
  const { markGone, refreshInfo, removeLocal, mailboxes, setActive } = useMailboxes();
  const ui = useUi();
  const mailboxId = mailbox.id;

  const [items, setItems] = useState<MessageSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'bulk-delete' | 'empty-trash' | null>(null);
  const readerRef = useRef<ReaderHandle>(null);
  const seq = useRef(0);
  const pages = useRef(1);

  const query = useMemo(() => ({ folder, ...toQuery(search) }), [folder, search]);
  const queryKey = `${mailboxId}|${JSON.stringify(query)}`;
  const searching = isSearchActive(search);

  const handleListError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) {
        markGone(mailboxId);
        setError('This mailbox has expired or was removed.');
      } else {
        setError(errorMessage(e));
      }
    },
    [mailboxId, markGone],
  );

  // Fresh load whenever the mailbox, folder or search changes.
  useEffect(() => {
    const ctrl = new AbortController();
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    setSelected(new Set());
    setFocusedId(null);
    pages.current = 1;
    api
      .listMessages(mailboxId, { ...query, limit: PAGE_SIZE }, ctrl.signal)
      .then((res) => {
        if (my !== seq.current) return;
        setItems(res.items);
        setCursor(res.next_cursor);
      })
      .catch((e) => {
        if (isAbort(e) || my !== seq.current) return;
        handleListError(e);
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
    return () => ctrl.abort();
    // queryKey captures mailboxId + query
  }, [queryKey, attempt]);

  // Silent refresh: merge the newest page into what is already loaded.
  const silentRefresh = useCallback(async () => {
    const my = ++seq.current;
    try {
      const res = await api.listMessages(mailboxId, { ...query, limit: PAGE_SIZE });
      if (my !== seq.current) return;
      setError(null);
      setItems((prev) => {
        if (pages.current <= 1 || res.items.length === 0) return res.items;
        const ids = new Set(res.items.map((i) => i.id));
        const oldest = res.items[res.items.length - 1].received_at;
        const tail = prev.filter((p) => !ids.has(p.id) && p.received_at < oldest);
        return [...res.items, ...tail];
      });
      if (pages.current <= 1) setCursor(res.next_cursor);
      setSelected((sel) => {
        if (sel.size === 0) return sel;
        const ids = new Set(res.items.map((i) => i.id));
        return new Set([...sel].filter((id) => ids.has(id)));
      });
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ApiError && e.status === 404) handleListError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [mailboxId, query, handleListError]);

  const firstSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === firstSignal.current) return;
    void silentRefresh();
    // only react to the signal
  }, [refreshSignal]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loading) return;
    setLoadingMore(true);
    const my = seq.current;
    try {
      const res = await api.listMessages(mailboxId, { ...query, limit: PAGE_SIZE, cursor });
      if (my !== seq.current) return;
      pages.current += 1;
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((i) => !ids.has(i.id))];
      });
      setCursor(res.next_cursor);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, mailboxId, query, toast]);

  // ---- Item actions -------------------------------------------------------

  const applySummary = useCallback((s: MessageSummary) => {
    setItems((prev) => prev.map((i) => (i.id === s.id ? { ...i, ...s } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const next = prev.filter((i) => i.id !== id);
      if (idx !== -1) setFocusedId(next[Math.min(idx, next.length - 1)]?.id ?? null);
      return next;
    });
    setSelected((sel) => {
      if (!sel.has(id)) return sel;
      const n = new Set(sel);
      n.delete(id);
      return n;
    });
  }, []);

  const toggleStar = useCallback(
    async (m: MessageSummary) => {
      const want = !m.is_starred;
      applySummary({ ...m, is_starred: want });
      try {
        applySummary(await api.patchMessage(mailboxId, m.id, { is_starred: want }));
      } catch (e) {
        applySummary({ ...m, is_starred: !want });
        toast(errorMessage(e), 'error');
      }
    },
    [mailboxId, applySummary, toast],
  );

  const setRead = useCallback(
    async (m: MessageSummary, read: boolean) => {
      if (m.is_read === read) return;
      applySummary({ ...m, is_read: read });
      try {
        applySummary(await api.patchMessage(mailboxId, m.id, { is_read: read }));
        void refreshInfo(mailboxId);
      } catch (e) {
        applySummary(m);
        toast(errorMessage(e), 'error');
      }
    },
    [mailboxId, applySummary, refreshInfo, toast],
  );

  const trashOne = useCallback(
    async (m: MessageSummary) => {
      try {
        if (m.in_trash) {
          await api.restoreMessage(mailboxId, m.id);
          toast('Message restored.', 'success');
        } else {
          await api.trashMessage(mailboxId, m.id);
          toast('Moved to Trash.', 'success');
        }
        removeItem(m.id);
        void refreshInfo(mailboxId);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    [mailboxId, removeItem, refreshInfo, toast],
  );

  const bulk = useCallback(
    async (action: BulkAction) => {
      const ids = [...selected];
      if (ids.length === 0) return;
      try {
        const res = await api.bulkMessages(mailboxId, ids, action);
        const n = res?.updated ?? ids.length;
        const verb: Record<BulkAction, string> = {
          read: 'marked as read',
          unread: 'marked as unread',
          star: 'starred',
          unstar: 'unstarred',
          trash: 'moved to Trash',
          restore: 'restored',
          delete: 'deleted forever',
        };
        toast(`${pluralize(n, 'message')} ${verb[action]}.`, 'success');
        if (action === 'trash' || action === 'restore' || action === 'delete') {
          ids.forEach(removeItem);
          if (messageId && ids.includes(messageId)) onOpen(null);
        }
        setSelected(new Set());
        await silentRefresh();
        void refreshInfo(mailboxId);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    },
    [selected, mailboxId, removeItem, messageId, onOpen, silentRefresh, refreshInfo, toast],
  );

  // ---- Keyboard shortcuts -------------------------------------------------

  const stateRef = useRef({ items, focusedId, messageId });
  stateRef.current = { items, focusedId, messageId };

  useEffect(() => {
    const focusRow = (id: string) => {
      setFocusedId(id);
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-msg-open="${CSS.escape(id)}"]`)?.focus(), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      const { items: list, focusedId: fid, messageId: openId } = stateRef.current;
      const currentId = openId ?? fid;
      const idx = currentId ? list.findIndex((i) => i.id === currentId) : -1;
      const current = idx >= 0 ? list[idx] : null;
      const key = e.key;

      if (key === 'j' || key === 'k') {
        e.preventDefault();
        if (list.length === 0) return;
        const nextIdx = idx === -1 ? 0 : key === 'j' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
        const target = list[nextIdx];
        if (openId) onOpen(target.id);
        focusRow(target.id);
      } else if ((key === 'Enter' || key === 'o') && !openId) {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON' && key === 'Enter') return;
        if (fid) {
          e.preventDefault();
          onOpen(fid);
        }
      } else if ((key === 'u' || key === 'Escape') && openId) {
        e.preventDefault();
        onOpen(null);
        focusRow(openId);
      } else if (key === 's') {
        e.preventDefault();
        if (openId) readerRef.current?.toggleStar();
        else if (current) void toggleStar(current);
      } else if (key === '#' || key === 'Delete') {
        e.preventDefault();
        if (openId) readerRef.current?.trash();
        else if (current) void trashOne(current);
      } else if (key === 'I' && e.shiftKey) {
        e.preventDefault();
        if (openId) readerRef.current?.markRead(true);
        else if (current) void setRead(current, true);
      } else if (key === 'U' && e.shiftKey) {
        e.preventDefault();
        if (openId) readerRef.current?.markRead(false);
        else if (current) void setRead(current, false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, toggleStar, trashOne, setRead]);

  // ---- Rendering ----------------------------------------------------------

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const showDemoBanner = mailbox.is_demo || items.some((i) => i.is_demo);
  const unread = mailbox.info?.unread_count ?? 0;

  const toggleSelect = (id: string) =>
    setSelected((sel) => {
      const n = new Set(sel);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const emptyNode = searching ? (
    <EmptyState icon={<IconSearch />} title="No messages match your search">
      <p>Try fewer words, or check the spelling of the sender or subject.</p>
      <button type="button" className={btnSecondary} onClick={onClearSearch}>
        Clear search
      </button>
    </EmptyState>
  ) : folder === 'inbox' ? (
    <EmptyState icon={<IconInbox />} title="No messages yet">
      <p>
        Send an email to <span className="break-all font-mono font-semibold text-slate-900 dark:text-white">{mailbox.address}</span> — new mail
        appears here automatically.
      </p>
      <div className="flex justify-center">
        <CopyButton text={mailbox.address} label="Copy address" ariaLabel="Copy e-mail address" variant="custom" className={btnSecondary} />
      </div>
      <p className="text-xs">M-Ai-L Box can only receive mail sent to its own domains. Nothing you do here sends e-mail.</p>
    </EmptyState>
  ) : folder === 'starred' ? (
    <EmptyState icon={<IconStar />} title="No starred messages">
      <p>Star a message to find it here quickly. Press s while a message is selected.</p>
    </EmptyState>
  ) : (
    <EmptyState icon={<IconTrash />} title="Trash is empty">
      <p>Messages you delete wait here for {config.trash_retention_days} days before they are removed for good.</p>
    </EmptyState>
  );

  if (mailbox.gone) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState icon={<IconMail />} title="This mailbox has expired or was removed">
          <p>
            <span className="break-all font-mono">{mailbox.address}</span> is no longer available. Temporary mailboxes are deleted with all of
            their messages when they expire.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {mailbox.token && (
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  const next = mailboxes.find((m) => m.id !== mailbox.id && !m.gone);
                  if (next) setActive(next.id);
                  removeLocal(mailbox.id);
                }}
              >
                Remove from this browser
              </button>
            )}
            <button type="button" className={btnSecondary} onClick={ui.openCreate}>
              Create a new mailbox
            </button>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* List pane */}
      <section
        aria-label={`${FOLDER_LABEL[folder]} messages`}
        className={cx(
          'flex min-h-0 w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-[22rem] lg:w-[24rem] xl:w-[28rem] md:shrink-0',
          messageId && 'hidden md:flex',
        )}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <input
            ref={selectAllRef}
            type="checkbox"
            className={checkbox}
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
            aria-label={allSelected ? 'Deselect all messages' : 'Select all loaded messages'}
            disabled={items.length === 0}
          />
          {selected.size > 0 ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" role="toolbar" aria-label="Actions for selected messages">
              <span className="mr-1 text-xs font-medium text-slate-700 dark:text-slate-300">{selected.size} selected</span>
              {folder === 'trash' ? (
                <>
                  <button type="button" className={iconBtn} onClick={() => void bulk('restore')} aria-label="Restore selected" title="Restore">
                    <IconRestore className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconBtn} onClick={() => setConfirm('bulk-delete')} aria-label="Delete selected forever" title="Delete forever">
                    <IconX className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button type="button" className={iconBtn} onClick={() => void bulk('trash')} aria-label="Move selected to Trash" title="Move to Trash">
                  <IconTrash className="h-4 w-4" />
                </button>
              )}
              <button type="button" className={iconBtn} onClick={() => void bulk('read')} aria-label="Mark selected as read" title="Mark as read">
                <IconMail className="h-4 w-4" />
              </button>
              <button type="button" className={iconBtn} onClick={() => void bulk('unread')} aria-label="Mark selected as unread" title="Mark as unread">
                <IconMailOpen className="h-4 w-4" />
              </button>
              <button type="button" className={iconBtn} onClick={() => void bulk('star')} aria-label="Star selected" title="Star">
                <IconStar className="h-4 w-4" />
              </button>
              <button type="button" className={iconBtn} onClick={() => void bulk('unstar')} aria-label="Unstar selected" title="Remove star">
                <IconStar filled className="h-4 w-4" />
              </button>
              {folder !== 'trash' && (
                <button type="button" className={iconBtn} onClick={() => setConfirm('bulk-delete')} aria-label="Delete selected forever" title="Delete forever">
                  <IconX className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h1 className="text-sm font-semibold text-slate-900 dark:text-white">{searching ? 'Search results' : FOLDER_LABEL[folder]}</h1>
              {!searching && folder === 'inbox' && unread > 0 && <span className="text-xs text-slate-600 dark:text-slate-400">{unread} unread</span>}
              {searching && (
                <button type="button" className={cx(btnSmall, 'ml-auto')} onClick={onClearSearch}>
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>

        {showDemoBanner && <DemoBanner />}

        {folder === 'trash' && (
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <InfoBanner>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1">Messages in Trash are permanently deleted after {config.trash_retention_days} days.</span>
                <button type="button" className={cx(btnSmall, 'text-red-700 dark:text-red-300')} onClick={() => setConfirm('empty-trash')} disabled={items.length === 0}>
                  Empty trash
                </button>
              </div>
            </InfoBanner>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageList
            items={items}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={!!cursor}
            onLoadMore={() => void loadMore()}
            onRetry={() => setAttempt((n) => n + 1)}
            selected={selected}
            onToggleSelect={toggleSelect}
            openId={messageId}
            focusedId={focusedId}
            onOpen={(id) => {
              setFocusedId(id);
              onOpen(id);
            }}
            onToggleStar={(m) => void toggleStar(m)}
            empty={emptyNode}
            label={`${FOLDER_LABEL[folder]} messages`}
          />
        </div>
      </section>

      {/* Reading pane */}
      <section
        aria-label="Reading pane"
        className={cx('min-h-0 min-w-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900', !messageId && 'hidden md:block')}
      >
        {messageId ? (
          <MessageReader
            key={messageId}
            ref={readerRef}
            mailboxId={mailboxId}
            messageId={messageId}
            onBack={() => onOpen(null)}
            onUpdated={applySummary}
            onRemoved={(id) => {
              removeItem(id);
              onOpen(null);
              void refreshInfo(mailboxId);
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            <div>
              <IconMail className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-700 dark:text-slate-300">Select an email to view its contents</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                Incoming messages will appear here automatically. You can read emails, extract verification codes, download attachments, or check delivery speed in real time.
              </p>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm === 'bulk-delete'}
        title={`Delete ${pluralize(selected.size, 'message')} forever?`}
        confirmLabel="Delete forever"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => bulk('delete')}
      >
        <p>The selected messages and their attachments will be permanently deleted. This cannot be undone.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'empty-trash'}
        title="Empty Trash?"
        confirmLabel="Empty trash"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const res = await api.emptyTrash(mailboxId);
          toast(`${pluralize(res?.deleted ?? 0, 'message')} permanently deleted.`, 'success');
          if (messageId) onOpen(null);
          setAttempt((n) => n + 1);
          void refreshInfo(mailboxId);
        }}
      >
        <p>All messages in Trash will be permanently deleted now. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}


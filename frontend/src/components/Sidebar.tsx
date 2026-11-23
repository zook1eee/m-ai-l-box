import { useId, useState, type ReactNode } from 'react';
import { useMailboxes, type KnownMailbox } from '../context/MailboxContext';
import { useSession } from '../context/SessionContext';
import { useUi } from '../context/UiContext';
import type { View } from '../hooks/useHashRoute';
import { useNow } from '../hooks/useNow';
import { cx } from '../lib/cx';
import { expiryInfo } from '../lib/format';
import { ConfirmDialog } from './ConfirmDialog';
import {
  IconFolder,
  IconHelp,
  IconInbox,
  IconKey,
  IconPaperclip,
  IconPencil,
  IconPlus,
  IconSend,
  IconShield,
  IconSparkles,
  IconStar,
  IconTrash,
  IconUser,
  IconX,
} from './Icons';
import { focusRing, iconBtnSm } from './ui';

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  collapsed?: boolean;
}

export function Sidebar({ view, onNavigate, collapsed = false }: SidebarProps) {
  const { signedIn, isAdmin } = useSession();
  const { active } = useMailboxes();
  const ui = useUi();
  const unread = active?.info?.unread_count ?? 0;

  const isExpired = active?.gone === true;

  // Gmail-style pill nav item
  const nav = (v: View, text: string, icon: ReactNode, count?: number) => (
    <li>
      <a
        href={`#/${v}`}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(v);
        }}
        aria-current={view === v ? 'page' : undefined}
        title={collapsed ? text : undefined}
        className={cx(
          'flex items-center rounded-r-full py-1.5 transition-colors',
          focusRing,
          collapsed ? 'justify-center px-0 mx-2 rounded-full h-10 w-10' : 'gap-4 pl-4 pr-4 text-sm font-medium',
          view === v
            ? 'bg-[#D3E3FD] text-[#001D35] dark:bg-[#004A77] dark:text-[#C2E7FF]'
            : 'text-[#202124] hover:bg-[#e8eaed] dark:text-[#e3e3e3] dark:hover:bg-[#3c4043]',
        )}
      >
        <span className="shrink-0 text-[#444746] dark:text-[#9aa0a6] relative">
          {icon}
          {collapsed && count !== undefined && count > 0 && (
            <span className="absolute -top-1 -right-2 h-2.5 w-2.5 rounded-full bg-[#1A73E8]" />
          )}
        </span>
        {!collapsed && <span className="flex-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>{text}</span>}
        {!collapsed && count !== undefined && count > 0 && (
          <span
            className="text-xs font-semibold text-[#202124] dark:text-[#e3e3e3]"
            aria-label={`${count} unread`}
          >
            {count > 999 ? '999+' : count}
          </span>
        )}
      </a>
    </li>
  );

  return (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto pb-4 bg-[#f6f8fc] dark:bg-[#1f1f1f]">
      {/* Compose & Create buttons — Gmail pill style */}
      <div className={cx('pt-4 pb-2 space-y-2', collapsed ? 'flex flex-col items-center px-1' : 'px-2')}>
        <button
          type="button"
          onClick={ui.openCompose}
          disabled={!active || isExpired}
          title={isExpired ? 'Mailbox has expired' : !active ? 'No active mailbox' : 'Compose new email'}
          className={cx(
            'flex items-center rounded-2xl bg-[#C2E7FF] text-[#001D35] shadow-md transition-all hover:bg-[#A8D7FF] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#C2E7FF] dark:bg-[#004A77] dark:text-[#C2E7FF] dark:hover:bg-[#005C8F]',
            focusRing,
            collapsed ? 'h-12 w-12 justify-center p-0' : 'w-full gap-3 px-5 py-3 text-sm font-medium',
          )}
        >
          <IconPencil className="h-5 w-5" />
          {!collapsed && <span style={{ fontFamily: "'Google Sans', sans-serif" }}>Compose</span>}
        </button>

        <button
          type="button"
          onClick={ui.openCreate}
          title="Create new mailbox"
          className={cx(
            'flex items-center justify-center rounded-full border border-[#dadce0] bg-[#f8fafd] text-[#1f1f1f] shadow-sm transition-all hover:bg-[#e8eaed] hover:shadow dark:border-[#444746] dark:bg-[#303134] dark:text-[#e3e3e3] dark:hover:bg-[#3c4043]',
            focusRing,
            collapsed ? 'h-10 w-10 p-0' : 'w-full gap-2 px-4 py-2 text-xs font-semibold tracking-wide',
          )}
        >
          <IconPlus className="h-4 w-4 text-[#1A73E8] dark:text-[#8ab4f8]" />
          {!collapsed && <span>New mailbox</span>}
        </button>
      </div>

      {/* Primary nav */}
      <ul className={cx('mt-1 space-y-1', !collapsed && 'pr-3')}>
        {nav('inbox', 'Inbox', <IconInbox />, unread)}
        {nav('sent', 'Sent', <IconSend />)}
        {nav('assistant', 'AI Assistant', <IconSparkles />)}
        {nav('starred', 'Starred', <IconStar />)}
        {nav('attachments', 'Attachments', <IconPaperclip />)}
        {nav('trash', 'Trash', <IconTrash />)}
      </ul>

      {/* Account nav (signed-in only) */}
      {signedIn && (
        <ul className={cx('mt-2 space-y-1 border-t border-[#e0e0e0] pt-2 dark:border-[#3c4043]', !collapsed && 'pr-3')}>
          {nav('files', 'My files', <IconFolder />)}
          {nav('api-keys', 'API keys', <IconKey />)}
          {nav('account', 'Account', <IconUser />)}
          {isAdmin && nav('admin', 'Admin', <IconShield />)}
        </ul>
      )}

      {!collapsed && <MailboxSwitcher />}

      {/* Help link at bottom */}
      <div className={cx('mt-auto pt-4', collapsed ? 'flex justify-center px-1' : 'px-2')}>
        <button
          type="button"
          title="How mailboxes work"
          className={cx(
            'flex items-center text-[#5f6368] hover:bg-[#e8eaed] dark:text-[#9aa0a6] dark:hover:bg-[#3c4043]',
            focusRing,
            collapsed ? 'h-10 w-10 justify-center rounded-full' : 'w-full gap-3 rounded-full px-4 py-2 text-sm',
          )}
          onClick={ui.openHelp}
        >
          <IconHelp className="h-4 w-4" />
          {!collapsed && <span>How mailboxes work</span>}
        </button>
      </div>
    </nav>
  );
}

function MailboxSwitcher() {
  const { mailboxes, active, setActive, removeLocal } = useMailboxes();
  const ui = useUi();
  const now = useNow(60_000);
  const [removing, setRemoving] = useState<KnownMailbox | null>(null);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mt-2 border-t border-[#e0e0e0] px-2 pt-3 dark:border-[#3c4043]"
    >
      <div className="mb-2 flex items-center justify-between px-2">
        <h2
          id={headingId}
          className="text-xs font-semibold uppercase tracking-wide text-[#5f6368] dark:text-[#9aa0a6]"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          Mailboxes
        </h2>
        <span className="text-xs text-[#5f6368] dark:text-[#9aa0a6]">{mailboxes.length}</span>
      </div>

      {mailboxes.length === 0 ? (
        <p className="px-2 text-xs text-[#5f6368] dark:text-[#9aa0a6]">No mailboxes in this browser yet.</p>
      ) : (
        <ul className="space-y-1">
          {mailboxes.map((m) => {
            const exp = expiryInfo(m.expires_at, now);
            const isActive = active?.id === m.id;
            const unread = m.info?.unread_count ?? 0;
            return (
              <li key={m.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setActive(m.id);
                    ui.navigate('inbox');
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={cx(
                    'w-full rounded-r-full px-3 py-2 pr-8 text-left transition-colors',
                    focusRing,
                    isActive
                      ? 'bg-[#D3E3FD] dark:bg-[#004A77]'
                      : 'hover:bg-[#e8eaed] dark:hover:bg-[#3c4043]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate font-mono text-xs',
                        m.gone ? 'text-[#9aa0a6] line-through' : 'text-[#202124] dark:text-[#e3e3e3]',
                      )}
                    >
                      {m.address}
                    </span>
                    {unread > 0 && !m.gone && (
                      <span
                        className="rounded-full bg-[#1A73E8] px-1.5 text-[11px] font-bold text-white dark:bg-[#8ab4f8] dark:text-[#202124]"
                        aria-label={`${unread} unread`}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                    {m.label && <span className="truncate font-medium text-[#202124] dark:text-[#e3e3e3]">{m.label}</span>}
                    {m.gone ? (
                      <span className="font-semibold text-red-600 dark:text-red-400">Expired or removed</span>
                    ) : m.saved ? (
                      <span>Saved{m.token ? '' : ' · account only'}</span>
                    ) : (
                      <span className={exp.soon || exp.expired ? 'font-semibold text-amber-700 dark:text-amber-400' : undefined}>
                        {exp.text}
                      </span>
                    )}
                    {m.is_demo && <span className="font-semibold text-fuchsia-700 dark:text-fuchsia-400">Demo</span>}
                  </div>
                </button>
                {m.token && (
                  <button
                    type="button"
                    className={cx(
                      iconBtnSm,
                      'absolute right-1 top-1.5',
                      !m.gone && 'opacity-60 group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                    aria-label={`Remove ${m.address} from this browser`}
                    title="Remove from this browser"
                    onClick={() => setRemoving(m)}
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className={cx(
          'mt-2 flex w-full items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-xs text-[#444746] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#c4c7c5] dark:hover:bg-[#37393b]',
          focusRing,
        )}
        onClick={ui.openExisting}
      >
        <IconKey className="h-4 w-4" />
        Open existing mailbox
      </button>

      <ConfirmDialog
        open={!!removing}
        title={removing?.gone ? 'Remove this mailbox?' : 'Remove from this browser?'}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          if (active?.id === removing.id) {
            const next = mailboxes.find((x) => x.id !== removing.id && !x.gone);
            if (next) setActive(next.id);
          }
          removeLocal(removing.id);
        }}
      >
        {removing?.gone ? (
          <p>
            <span className="break-all font-mono">{removing.address}</span> has expired or was deleted. Remove it from the list?
          </p>
        ) : (
          <p>
            This browser forgets the access key for <span className="break-all font-mono">{removing?.address}</span>. The mailbox itself is not
            deleted.{' '}
            {removing?.saved ? 'It stays available in your account.' : 'Make sure you have saved the key if you want to come back to it.'}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

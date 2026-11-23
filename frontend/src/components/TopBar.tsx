import { useEffect, useRef, useState, type RefObject } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useMailboxes } from '../context/MailboxContext';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import { useUi } from '../context/UiContext';
import type { LiveStatus } from '../hooks/useLiveUpdates';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useNow } from '../hooks/useNow';
import { cx } from '../lib/cx';
import { expiryInfo, formatBytes, formatFull } from '../lib/format';
import { advancedCount, EMPTY_SEARCH, type SearchState } from '../views/search';
import { CopyButton } from './CopyButton';
import { UsageBar } from './Feedback';
import { IconFilter, IconHelp, IconLogOut, IconMenu, IconMoon, IconRefresh, IconSearch, IconShield, IconSun, IconUser, IconX, IconFolder, IconKey } from './Icons';
import { MailboxSettingsMenu } from './MailboxSettingsMenu';
import { Menu, type MenuItem } from './Menu';
import { SearchPanel } from './SearchPanel';
import { focusRing, iconBtn } from './ui';

interface TopBarProps {
  onOpenDrawer: () => void;
  search: SearchState;
  onSearch: (s: SearchState) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  onRefresh: () => void;
  refreshing: boolean;
  liveStatus: LiveStatus;
  onToggleSidebar?: () => void;
}

export function TopBar({ onOpenDrawer, onToggleSidebar, search, onSearch, searchInputRef, onRefresh, refreshing, liveStatus }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const ui = useUi();
  const [q, setQ] = useState(search.q);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const mobileWrapRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => setQ(search.q), [search.q]);

  // Debounce typing in the quick search box.
  useEffect(() => {
    if (q === search.q) return;
    const t = window.setTimeout(() => onSearch({ ...search, q }), 350);
    return () => window.clearTimeout(t);
  }, [q, search, onSearch]);

  useEffect(() => {
    if (!advancedOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchWrapRef.current?.contains(t) || mobileWrapRef.current?.contains(t)) return;
      setAdvancedOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [advancedOpen]);

  const adv = advancedCount(search);

  return (
    <header className="bg-[#f6f8fc] dark:bg-[#1f1f1f]">
      {/* Main toolbar row */}
      <div className="flex items-center gap-1 px-2 py-2">
        {/* Hamburger — on desktop toggles collapse, on mobile opens drawer */}
        <button
          type="button"
          className={cx(iconBtn, 'ml-1')}
          onClick={() => {
            if (window.innerWidth >= 1024 && onToggleSidebar) {
              onToggleSidebar();
            } else {
              onOpenDrawer();
            }
          }}
          aria-label="Main menu"
          title="Main menu"
        >
          <IconMenu />
        </button>

        {/* Logo area — hidden on mobile, shown on sm+ */}
        <div className="hidden shrink-0 items-center px-2 sm:flex">
          <div className="flex items-center gap-3">
            <a
              href="#/welcome"
              onClick={(e) => {
                e.preventDefault();
                ui.navigate('welcome');
              }}
              className="cursor-pointer outline-none transition-transform active:scale-95 py-0.5"
              aria-label="Go to home welcome page"
              title="M-Ai-L Box Home"
            >
              <img src="/logo-icon.png" alt="M-Ai-L Box Logo" className="h-9 w-auto object-contain shrink-0" />
            </a>
            <a
              href="#/welcome"
              onClick={(e) => {
                e.preventDefault();
                ui.navigate('welcome');
              }}
              className="flex items-center tracking-tight text-[19px] font-bold leading-none font-sans select-none cursor-pointer outline-none group"
              title="M-Ai-L Box Home"
            >
              <span className="text-[#0d1b3e] dark:text-white group-hover:opacity-80">M-</span>
              <span className="text-[#0070f3] dark:text-[#2997ff]">Ai</span>
              <span className="text-[#0d1b3e] dark:text-white group-hover:opacity-80">-L Box</span>
            </a>
          </div>
        </div>

        {/* Mobile logo + text */}
        <div className="flex items-center gap-2 sm:hidden">
          <a
            href="#/welcome"
            onClick={(e) => {
              e.preventDefault();
              ui.navigate('welcome');
            }}
            className="cursor-pointer outline-none transition-transform active:scale-95"
            aria-label="Go to home welcome page"
            title="M-Ai-L Box Home"
          >
            <img src="/logo-icon.png" alt="M-Ai-L Box Logo" className="h-7 w-auto object-contain shrink-0" />
          </a>
          <a
            href="#/welcome"
            onClick={(e) => {
              e.preventDefault();
              ui.navigate('welcome');
            }}
            className="flex items-center tracking-tight text-[17px] font-bold leading-none font-sans select-none cursor-pointer outline-none"
            title="M-Ai-L Box Home"
          >
            <span className="text-[#0d1b3e] dark:text-white">M-</span>
            <span className="text-[#0070f3] dark:text-[#2997ff]">Ai</span>
            <span className="text-[#0d1b3e] dark:text-white">-L Box</span>
          </a>
        </div>

        {/* Search bar — desktop */}
        <div ref={searchWrapRef} className="relative ml-2 hidden max-w-2xl flex-1 md:block">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              onSearch({ ...search, q });
            }}
            className="flex items-center rounded-2xl bg-[#eaf1fb] pl-4 pr-2 h-12 focus-within:bg-white focus-within:shadow-md focus-within:ring-0 dark:bg-[#303134] dark:focus-within:bg-[#3c4043] transition-all"
          >
            <IconSearch className="h-5 w-5 shrink-0 text-[#5f6368] dark:text-[#9aa0a6]" />
            <label htmlFor="mail-search" className="sr-only">Search mail</label>
            <input
              ref={searchInputRef}
              id="mail-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
              placeholder="Search mail  ( / )"
              className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-[#202124] placeholder:text-[#5f6368] focus:outline-none focus:ring-0 dark:text-[#e3e3e3] dark:placeholder:text-[#9aa0a6]"
              autoComplete="off"
            />
            {(q || adv > 0) && (
              <button
                type="button"
                className={iconBtn}
                aria-label="Clear search"
                onClick={() => { setQ(''); onSearch(EMPTY_SEARCH); }}
              >
                <IconX className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className={cx(iconBtn, 'relative')}
              aria-label="Advanced search"
              aria-expanded={advancedOpen}
              title="Advanced search"
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              <IconFilter className="h-5 w-5" />
              {adv > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#1A73E8] px-1 text-[10px] font-bold text-white">
                  {adv}
                </span>
              )}
            </button>
          </form>
          {advancedOpen && isDesktop && (
            <div>
              <SearchPanel value={{ ...search, q }} onApply={onSearch} onClose={() => setAdvancedOpen(false)} />
            </div>
          )}
        </div>

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-0.5">
          <LiveIndicator status={liveStatus} />
          <button type="button" className={iconBtn} onClick={onRefresh} aria-label="Refresh (r)" title="Refresh (r)" disabled={refreshing}>
            <IconRefresh className={cx('h-5 w-5', refreshing && 'motion-safe:animate-spin')} />
          </button>
          <button
            type="button"
            className={iconBtn}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button type="button" className={cx(iconBtn, 'hidden sm:inline-flex')} onClick={ui.openHelp} aria-label="How mailboxes work" title="Help">
            <IconHelp />
          </button>
          <AccountMenu />
        </div>
      </div>

      {/* Mobile search row */}
      <div ref={mobileWrapRef} className="relative px-2 pb-2 md:hidden">
        <form
          role="search"
          onSubmit={(e) => { e.preventDefault(); onSearch({ ...search, q }); }}
          className="flex items-center rounded-2xl bg-[#eaf1fb] pl-4 pr-2 h-10 dark:bg-[#303134] transition-all"
        >
          <IconSearch className="h-4 w-4 shrink-0 text-[#5f6368]" />
          <label htmlFor="mail-search-mobile" className="sr-only">Search mail</label>
          <input
            id="mail-search-mobile"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mail"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-[#202124] placeholder:text-[#5f6368] focus:outline-none focus:ring-0 dark:text-[#e3e3e3]"
            autoComplete="off"
          />
          <button
            type="button"
            className={iconBtn}
            aria-label="Advanced search"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <IconFilter className="h-4 w-4" />
          </button>
        </form>
        {advancedOpen && !isDesktop && (
          <div>
            <SearchPanel value={{ ...search, q }} onApply={onSearch} onClose={() => setAdvancedOpen(false)} />
          </div>
        )}
      </div>

      <ActiveAddressBar />
    </header>
  );
}

function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === 'idle') return null;
  const text =
    status === 'live'
      ? 'Live: new mail appears automatically'
      : status === 'polling'
        ? 'Live updates unavailable: checking every 15 seconds'
        : status === 'connecting'
          ? 'Connecting for live updates…'
          : 'Reconnecting live updates…';
  const dot =
    status === 'live'
      ? 'bg-[#1e8e3e]'
      : status === 'polling'
        ? 'bg-[#f9ab00]'
        : 'bg-[#9aa0a6] motion-safe:animate-pulse';
  return (
    <span className="mr-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs text-[#5f6368] dark:text-[#9aa0a6] lg:inline-flex" title={text}>
      <span className={cx('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
      <span>{status === 'live' ? 'Live' : status === 'polling' ? 'Polling' : 'Connecting'}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

function ActiveAddressBar() {
  const { active } = useMailboxes();
  const now = useNow(30_000);
  const ui = useUi();
  if (!active) return null;
  const exp = expiryInfo(active.expires_at, now);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#e0e0e0] bg-[#fdfdfd] px-4 py-1 dark:border-[#333538] dark:bg-[#252628] sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className="sr-only">Active address:</span>
        <span
          className={cx(
            'min-w-0 truncate font-mono text-xs sm:text-sm font-medium',
            active.gone ? 'text-[#9aa0a6] line-through' : 'text-[#202124] dark:text-[#e3e3e3]',
          )}
          title={active.address}
        >
          {active.address}
        </span>
        <CopyButton text={active.address} label="Copy" ariaLabel="Copy e-mail address" />
        <MailboxSettingsMenu key={active.id} mailbox={active} />
      </div>
      <div className="flex min-w-0 items-center gap-x-2.5 text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
        {active.label && <span className="font-medium text-[#202124] dark:text-[#e3e3e3]">{active.label}</span>}
        {active.is_demo && (
          <span className="rounded bg-fuchsia-100 px-1.5 py-0.2 font-medium text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300">
            Demo
          </span>
        )}
        {active.gone ? (
          <span className="font-semibold text-red-600 dark:text-red-400">Expired</span>
        ) : active.saved ? (
          <span>Permanent</span>
        ) : (
          <span
            className={cx(exp.soon || exp.expired ? 'font-semibold text-amber-700 dark:text-amber-400' : undefined)}
            title={active.expires_at ? `Expires ${formatFull(active.expires_at)}` : undefined}
          >
            {exp.text}
          </span>
        )}
        <button
          type="button"
          className={cx('rounded text-[#1A73E8] hover:underline dark:text-[#8ab4f8]', focusRing)}
          onClick={ui.openHelp}
        >
          Help
        </button>
      </div>
    </div>
  );
}

function AccountMenu() {
  const config = useConfig();
  const session = useSession();
  const ui = useUi();
  if (!config.accounts_enabled) return null;

  if (!session.signedIn) {
    return (
      <div className="ml-1 flex items-center gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-4 py-1.5 text-sm font-medium text-[#1A73E8] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#8ab4f8] dark:hover:bg-[#37393b]"
          onClick={() => ui.openAuth('signin')}
        >
          Sign in
        </button>
      </div>
    );
  }

  const usage = session.usage;
  const items: Array<MenuItem | 'separator'> = [
    { label: 'Account', icon: <IconUser className="h-4 w-4" />, onSelect: () => ui.navigate('account') },
    { label: 'My files', icon: <IconFolder className="h-4 w-4" />, onSelect: () => ui.navigate('files') },
    { label: 'API keys', icon: <IconKey className="h-4 w-4" />, onSelect: () => ui.navigate('api-keys') },
  ];
  if (session.isAdmin) items.push({ label: 'Admin', icon: <IconShield className="h-4 w-4" />, onSelect: () => ui.navigate('admin') });
  items.push('separator', { label: 'Sign out', icon: <IconLogOut className="h-4 w-4" />, onSelect: () => void session.signOut() });

  const initial = (session.user?.email || '?').charAt(0).toUpperCase();

  return (
    <Menu
      triggerLabel={`Account menu for ${session.user?.email ?? ''}`}
      triggerClassName={cx('ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#1A73E8] text-sm font-bold text-white dark:bg-[#8ab4f8] dark:text-[#202124]', focusRing)}
      trigger={<span aria-hidden="true">{initial}</span>}
      items={items}
      header={
        <div className="space-y-2">
          <div className="truncate text-sm font-medium text-[#202124] dark:text-[#e3e3e3]">{session.user?.email}</div>
          {usage && (
            <UsageBar
              used={usage.used_bytes}
              quota={usage.quota_bytes}
              label={`${formatBytes(usage.used_bytes)} of ${formatBytes(usage.quota_bytes)} used`}
            />
          )}
        </div>
      }
    />
  );
}

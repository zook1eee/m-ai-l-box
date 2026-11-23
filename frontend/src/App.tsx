import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from './api/client';
import * as api from './api/endpoints';
import type { Mailbox } from './api/types';
import { AuthDialog, type AuthMode } from './components/AuthDialog';
import { ComposeDialog } from './components/ComposeDialog';
import { CreateMailboxDialog } from './components/CreateMailboxDialog';
import { ErrorBanner, Spinner } from './components/Feedback';
import { HelpDialog } from './components/HelpDialog';
import { IconX } from './components/Icons';
import { KeyPanelDialog } from './components/KeyPanelDialog';
import { OpenMailboxDialog } from './components/OpenMailboxDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { iconBtn } from './components/ui';
import { ConfigProvider, useConfig, useConfigState } from './context/ConfigContext';
import { MailboxProvider, useMailboxes } from './context/MailboxContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { UiContext, type KeyPanelReason, type UiActions } from './context/UiContext';
import { MAIL_VIEWS, useHashRoute, type View } from './hooks/useHashRoute';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { cx } from './lib/cx';
import { senderLabel } from './lib/format';
import { shouldIgnoreShortcut } from './lib/keys';
import { AccountView } from './views/AccountView';
import { AdminView } from './views/AdminView';
import { ApiKeysView } from './views/ApiKeysView';
import { AttachmentsView } from './views/AttachmentsView';
import { ClaudeChatView } from './views/ClaudeChatView';
import { FloatingChatWidget } from './components/FloatingChatWidget';
import { FilesView } from './views/FilesView';
import { MailView } from './views/MailView';
import { EMPTY_SEARCH, type SearchState } from './views/search';
import { SignInPrompt, WelcomeView } from './views/WelcomeView';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfigProvider>
          <ConfigGate />
        </ConfigProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function ConfigGate() {
  const { config, error, loading, reload } = useConfigState();
  if (!config) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f8fc] p-6 dark:bg-[#1f1f1f]">
        <div className="w-full max-w-md text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">M-Ai-L Box</p>
          {loading && (
            <div className="mt-4 flex justify-center text-slate-500">
              <Spinner className="h-6 w-6" label="Loading" />
            </div>
          )}
          {error && !loading && (
            <ErrorBanner className="mt-4 text-left" message={`Could not load the service settings. ${error}`} onRetry={reload} />
          )}
        </div>
      </div>
    );
  }
  return (
    <SessionProvider>
      <MailboxProvider>
        <Shell />
      </MailboxProvider>
    </SessionProvider>
  );
}

function Shell() {
  const config = useConfig();
  const session = useSession();
  const mailboxesCtx = useMailboxes();
  const { active, addMailbox, setCounts, refreshInfo, refreshSaved, markGone } = mailboxesCtx;
  const { toast } = useToast();
  const { route, navigate } = useHashRoute();

  const [createOpen, setCreateOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [existingOpen, setExistingOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [keyPanel, setKeyPanel] = useState<{ mailbox: Mailbox; token: string; reason: KeyPanelReason } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [manualTick, setManualTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Live updates for the active mailbox ----
  const activeId = active?.id ?? null;
  const canStream = !!active && !active.gone && (!!active.token || (session.signedIn && active.saved));
  const live = useLiveUpdates(activeId, canStream, {
    onState: (counts) => {
      if (activeId) setCounts(activeId, counts);
    },
    onMessage: (ev) => {
      if (!activeId) return;
      api
        .getMessage(activeId, ev.id)
        .then((d) => toast(`New message from ${senderLabel(d.from)}${d.subject ? ` — ${d.subject}` : ''}`))
        .catch(() => toast(`New message${ev.subject ? `: ${ev.subject}` : ''}`));
      void refreshInfo(activeId);
    },
    onPoll: () => {
      if (activeId) void refreshInfo(activeId);
    },
    onGone: () => {
      if (activeId) markGone(activeId);
    },
  });

  // Refresh the active mailbox details when switching to it.
  useEffect(() => {
    if (activeId) void refreshInfo(activeId);
  }, [activeId, refreshInfo]);

  // Keep the session's usage fresh periodically while signed in.
  useEffect(() => {
    if (!session.signedIn) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void session.refresh();
    }, 120_000);
    return () => window.clearInterval(t);
  }, [session.signedIn, session.refresh]);

  const refreshSignal = live.version + manualTick;

  const doRefresh = useCallback(() => {
    setManualTick((n) => n + 1);
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 600);
    if (activeId) void refreshInfo(activeId);
    void refreshSaved();
    if (session.signedIn) void session.refresh();
  }, [activeId, refreshInfo, refreshSaved, session]);

  const go = useCallback(
    (view: View, messageId?: string | null) => {
      setDrawerOpen(false);
      navigate(view, messageId ?? null);
    },
    [navigate],
  );

  const startDemo = useCallback(async () => {
    try {
      const res = await api.createDemoMailbox();
      addMailbox(res.mailbox, res.token);
      go('inbox');
      setKeyPanel({ mailbox: res.mailbox, token: res.token, reason: 'demo' });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [addMailbox, go, toast]);

  const focusSearch = useCallback(() => {
    const desktop = searchInputRef.current;
    if (desktop && desktop.offsetParent !== null) {
      desktop.focus();
      desktop.select();
      return;
    }
    const mobile = document.getElementById('mail-search-mobile') as HTMLInputElement | null;
    mobile?.focus();
  }, []);

  const ui = useMemo<UiActions>(
    () => ({
      openCreate: () => {
        setDrawerOpen(false);
        setCreateOpen(true);
      },
      openCompose: () => {
        setDrawerOpen(false);
        setComposeOpen(true);
      },
      openExisting: () => {
        setDrawerOpen(false);
        setExistingOpen(true);
      },
      openHelp: () => {
        setDrawerOpen(false);
        setHelpOpen(true);
      },
      openShortcuts: () => setShortcutsOpen(true),
      openAuth: (mode) => {
        setDrawerOpen(false);
        setAuthMode(mode);
      },
      showKey: (mailbox, token, reason) => setKeyPanel({ mailbox, token, reason }),
      startDemo: () => void startDemo(),
      navigate: go,
      focusSearch,
    }),
    [go, startDemo, focusSearch],
  );

  // ---- Global keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
      if (e.key === '/') {
        e.preventDefault();
        if (!MAIL_VIEWS.includes(route.view)) go('inbox');
        window.setTimeout(focusSearch, 0);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === 'c') {
        e.preventDefault();
        setCreateOpen(true);
      } else if (e.key === 'r') {
        e.preventDefault();
        doRefresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.view, go, focusSearch, doRefresh]);

  // Close the drawer with Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => document.querySelector<HTMLElement>('#mobile-drawer button, #mobile-drawer a')?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [drawerOpen]);

  const onSearch = useCallback(
    (s: SearchState) => {
      setSearch(s);
      if (!MAIL_VIEWS.includes(route.view)) navigate('inbox');
      else if (route.messageId) navigate(route.view, null);
    },
    [route.view, route.messageId, navigate],
  );

  // Document title with unread count.
  const unread = active?.info?.unread_count ?? 0;
  useEffect(() => {
    const name = config.app_name || 'M-Ai-L Box';
    document.title = unread > 0 ? `(${unread}) ${name}` : name;
  }, [unread, config.app_name]);

  let content: JSX.Element;
  const view = route.view;
  if (view === 'welcome') {
    content = <WelcomeView />;
  } else if (view === 'assistant') {
    content = <ClaudeChatView />;
  } else if (MAIL_VIEWS.includes(view)) {
    content = active ? (
      <MailView
        key={active.id}
        mailbox={active}
        folder={view as 'inbox' | 'sent' | 'starred' | 'trash'}
        messageId={route.messageId}
        search={search}
        onClearSearch={() => setSearch(EMPTY_SEARCH)}
        refreshSignal={refreshSignal}
        onOpen={(mid) => navigate(view, mid)}
      />
    ) : (
      <WelcomeView />
    );
  } else if (view === 'attachments') {
    content = active ? (
      <AttachmentsView key={active.id} mailbox={active} refreshSignal={refreshSignal} onOpenMessage={(mid) => navigate('inbox', mid)} />
    ) : (
      <WelcomeView />
    );
  } else if (!session.ready) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  } else if (!session.signedIn) {
    content = <SignInPrompt what={view === 'files' ? 'My files' : view === 'api-keys' ? 'API keys' : view === 'admin' ? 'the admin area' : 'your account'} />;
  } else if (view === 'files') content = <FilesView />;
  else if (view === 'api-keys') content = <ApiKeysView />;
  else if (view === 'account') content = <AccountView />;
  else content = <AdminView />;

  return (
    <UiContext.Provider value={ui}>
      <div className="flex h-[100dvh] flex-col bg-[#f6f8fc] text-[#202124] dark:bg-[#1f1f1f] dark:text-[#e3e3e3]">
        <a
          href="#main"
          className="sr-only z-[70] rounded bg-indigo-600 px-3 py-2 text-white focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('main')?.focus();
          }}
        >
          Skip to content
        </a>
        <TopBar
          onOpenDrawer={() => setDrawerOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          search={search}
          onSearch={onSearch}
          searchInputRef={searchInputRef}
          onRefresh={doRefresh}
          refreshing={refreshing}
          liveStatus={live.status}
        />
        <div className="flex min-h-0 flex-1">
          <aside
            className={cx(
              'hidden shrink-0 bg-[#f6f8fc] transition-all duration-200 dark:bg-[#1f1f1f] lg:block',
              sidebarCollapsed ? 'w-18' : 'w-64',
            )}
            aria-label="Sidebar"
          >
            <Sidebar view={view} onNavigate={(v) => go(v)} collapsed={sidebarCollapsed} />
          </aside>
          {drawerOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-slate-950/50" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
              <div
                id="mobile-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#f6f8fc] shadow-2xl motion-safe:animate-[slideIn_160ms_ease-out] dark:bg-[#1f1f1f]"
              >
                <div className="flex items-center justify-between border-b border-[#e0e0e0] px-4 py-3 dark:border-[#3c4043]">
                  <div className="flex items-center gap-2">
                    <img src="/logo-icon.png" alt="Logo" className="h-7 w-auto object-contain" />
                    <div>
                      <img
                        src="/logo-text.png"
                        alt={config.app_name || 'M-Ai-L Box'}
                        className="h-4 w-auto object-contain dark:hidden"
                      />
                      <img
                        src="/logo-text-dark.png"
                        alt={config.app_name || 'M-Ai-L Box'}
                        className="hidden h-4 w-auto object-contain dark:block"
                      />
                      {config.tagline && <div className="mt-0.5 text-[9px] font-medium text-[#1A73E8] dark:text-[#8ab4f8]">{config.tagline}</div>}
                    </div>
                  </div>
                  <button type="button" className={iconBtn} onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu">
                    <IconX />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Sidebar view={view} onNavigate={(v) => go(v)} />
                </div>
              </div>
            </div>
          )}
          <main id="main" tabIndex={-1} className={cx('flex min-h-0 min-w-0 flex-1 flex-col outline-none')}>
            {content}
          </main>
        </div>
      </div>

      <CreateMailboxDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} onSent={doRefresh} />
      <OpenMailboxDialog open={existingOpen} onClose={() => setExistingOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onShortcuts={() => setShortcutsOpen(true)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {config.accounts_enabled && <AuthDialog mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} />}
      <KeyPanelDialog data={keyPanel} onClose={() => setKeyPanel(null)} />
      <FloatingChatWidget />
    </UiContext.Provider>
  );
}

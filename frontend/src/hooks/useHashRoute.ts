import { useCallback, useEffect, useState } from 'react';

// Hash-based routing: "#/inbox", "#/inbox/<messageId>", "#/attachments", ...
// Only view names and message ids live in the URL — never credentials.

export type View = 'inbox' | 'sent' | 'starred' | 'trash' | 'attachments' | 'files' | 'api-keys' | 'account' | 'admin' | 'assistant' | 'welcome';

const VIEWS: View[] = ['inbox', 'sent', 'starred', 'trash', 'attachments', 'files', 'api-keys', 'account', 'admin', 'assistant', 'welcome'];

export const MAIL_VIEWS: View[] = ['inbox', 'sent', 'starred', 'trash'];

export interface Route {
  view: View;
  messageId: string | null;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const view = (VIEWS as string[]).includes(parts[0]) ? (parts[0] as View) : 'inbox';
  const messageId = MAIL_VIEWS.includes(view) && parts[1] ? decodeURIComponent(parts[1]) : null;
  return { view, messageId };
}

export function routeToHash(view: View, messageId?: string | null): string {
  return `#/${view}${messageId ? '/' + encodeURIComponent(messageId) : ''}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((view: View, messageId?: string | null, replace = false) => {
    const hash = routeToHash(view, messageId);
    if (window.location.hash === hash) return;
    if (replace) {
      window.history.replaceState(null, '', hash);
      setRoute(parse(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return { route, navigate };
}

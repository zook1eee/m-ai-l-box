import { createContext, useContext } from 'react';
import type { Mailbox } from '../api/types';
import type { View } from '../hooks/useHashRoute';

export type KeyPanelReason = 'created' | 'rotated' | 'demo' | 'view';

/** App-wide actions that open dialogs or navigate. Provided by <App>. */
export interface UiActions {
  openCreate: () => void;
  openCompose: () => void;
  openExisting: () => void;
  openHelp: () => void;
  openShortcuts: () => void;
  openAuth: (mode: 'signin' | 'register') => void;
  showKey: (mailbox: Mailbox, token: string, reason: KeyPanelReason) => void;
  startDemo: () => void;
  navigate: (view: View, messageId?: string | null) => void;
  focusSearch: () => void;
}

export const UiContext = createContext<UiActions | null>(null);

export function useUi(): UiActions {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiContext');
  return ctx;
}

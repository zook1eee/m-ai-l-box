import { IconKey, IconMail, IconPlus, IconUser } from '../components/Icons';
import { focusRing } from '../components/ui';
import { useConfig } from '../context/ConfigContext';
import { useSession } from '../context/SessionContext';
import { useUi } from '../context/UiContext';
import { cx } from '../lib/cx';

/** Shown when this browser has no mailbox yet. */
export function WelcomeView() {
  const config = useConfig();
  const { signedIn } = useSession();
  const ui = useUi();

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f8fc] dark:bg-[#1f1f1f]">
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24 text-center">

        {/* Brand Logo & Wordmark */}
        <div className="mx-auto mb-4 flex flex-col items-center justify-center">
          <img
            src="/logo-icon.png?v=3"
            alt={config.app_name || 'M-Ai-L Box'}
            className="h-28 sm:h-36 w-auto object-contain transition-transform hover:scale-105"
          />
          <div className="mt-3 flex items-center tracking-tight text-3xl sm:text-4xl font-bold leading-none font-sans select-none">
            <span className="text-[#0d1b3e] dark:text-white">M-</span>
            <span className="text-[#0070f3] dark:text-[#2997ff]">Ai</span>
            <span className="text-[#0d1b3e] dark:text-white">-L Box</span>
          </div>
        </div>
        <h1 className="sr-only">{config.app_name || 'M-Ai-L Box'}</h1>

        {/* Tagline / motto */}
        {config.tagline && (
          <div
            className="mt-2 flex items-center justify-center gap-1.5 text-base sm:text-lg font-medium tracking-normal"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <span className="text-[#3c4043] dark:text-[#bdc1c6]">Built for</span>
            <span className="font-semibold text-[#0070f3] dark:text-[#38bdf8]">developers.</span>
            <span className="text-[#3c4043] dark:text-[#bdc1c6] ml-1">Ready for</span>
            <span className="font-semibold text-[#00c7be] dark:text-[#34d399]">testers.</span>
          </div>
        )}

        <p className="mt-4 text-[#5f6368] dark:text-[#9aa0a6] max-w-lg mx-auto">
          Get a disposable e-mail address in one click. Use it to test sign-ups, password resets,
          verification codes and any other e-mail your app sends — then watch the messages arrive here in real time.
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={ui.openCreate}
            className={cx(
              'flex items-center gap-2 rounded-2xl bg-[#C2E7FF] px-6 py-3 text-base font-medium text-[#001D35] shadow-md hover:bg-[#A8D7FF] hover:shadow-lg dark:bg-[#004A77] dark:text-[#C2E7FF] dark:hover:bg-[#005C8F]',
              focusRing,
            )}
          >
            <IconPlus />
            Create new mailbox
          </button>
          <button
            type="button"
            onClick={ui.openExisting}
            className={cx(
              'flex items-center gap-2 rounded-2xl border border-[#dadce0] bg-white px-6 py-3 text-base font-medium text-[#444746] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#c4c7c5] dark:hover:bg-[#37393b]',
              focusRing,
            )}
          >
            <IconKey />
            Open existing mailbox
          </button>
          {config.demo_mode && (
            <button
              type="button"
              onClick={ui.startDemo}
              className={cx(
                'flex items-center gap-2 rounded-2xl border border-[#dadce0] bg-white px-6 py-3 text-base font-medium text-[#444746] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#c4c7c5] dark:hover:bg-[#37393b]',
                focusRing,
              )}
            >
              <IconMail />
              Try demo mailbox
            </button>
          )}
          {config.accounts_enabled && !signedIn && (
            <button
              type="button"
              onClick={() => ui.openAuth('signin')}
              className={cx(
                'flex items-center gap-2 rounded-2xl border border-[#dadce0] bg-white px-6 py-3 text-base font-medium text-[#444746] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#c4c7c5] dark:hover:bg-[#37393b]',
                focusRing,
              )}
            >
              <IconUser />
              Sign in
            </button>
          )}
        </div>

        {/* How it works cards — Gmail card style */}
        <div className="mt-12 grid gap-4 sm:grid-cols-3 text-left">
          {[
            {
              step: '1',
              title: 'Create an address',
              desc: `Random or custom. It lasts ${config.temp_mailbox_ttl_hours} hours unless you save it to an account.`,
            },
            {
              step: '2',
              title: 'Send mail to it',
              desc: 'From your app or test suite. New messages appear automatically.',
            },
            {
              step: '3',
              title: 'Inspect everything',
              desc: 'Codes, links, headers, raw source and attachments — ready to copy.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="rounded-2xl border border-[#e0e0e0] bg-white p-5 shadow-sm dark:border-[#3c4043] dark:bg-[#2d2e30]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#D3E3FD] text-sm font-bold text-[#1A73E8] dark:bg-[#004A77] dark:text-[#C2E7FF]">
                {step}
              </div>
              <h2
                className="font-semibold text-[#202124] dark:text-[#e3e3e3]"
                style={{ fontFamily: "'Google Sans', sans-serif" }}
              >
                {title}
              </h2>
              <p className="mt-1 text-sm text-[#5f6368] dark:text-[#9aa0a6]">{desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-[#5f6368] dark:text-[#9aa0a6]">
          Your mailbox&rsquo;s access key is kept in this browser.{' '}
          <button
            type="button"
            className={cx('text-[#1A73E8] underline-offset-2 hover:underline dark:text-[#8ab4f8]', focusRing)}
            onClick={ui.openHelp}
          >
            Learn how mailboxes, keys and expiry work
          </button>
          .
        </p>
      </div>
    </div>
  );
}

export function SignInPrompt({ what }: { what: string }) {
  const config = useConfig();
  const ui = useUi();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1
          className="text-xl font-semibold text-[#202124] dark:text-[#e3e3e3]"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          Sign in to use {what}
        </h1>
        <p className="mt-2 text-sm text-[#5f6368] dark:text-[#9aa0a6]">
          {config.accounts_enabled ? 'This feature needs an account.' : 'Accounts are turned off on this server.'}
        </p>
        {config.accounts_enabled && (
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              className={cx(
                'flex items-center gap-2 rounded-2xl bg-[#C2E7FF] px-5 py-2.5 text-sm font-medium text-[#001D35] shadow-md hover:bg-[#A8D7FF] dark:bg-[#004A77] dark:text-[#C2E7FF] dark:hover:bg-[#005C8F]',
                focusRing,
              )}
              onClick={() => ui.openAuth('signin')}
            >
              Sign in
            </button>
            {config.registration_open && (
              <button
                type="button"
                className={cx(
                  'flex items-center gap-2 rounded-2xl border border-[#dadce0] bg-white px-5 py-2.5 text-sm font-medium text-[#444746] shadow-sm hover:bg-[#f6f8fc] dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#c4c7c5] dark:hover:bg-[#37393b]',
                  focusRing,
                )}
                onClick={() => ui.openAuth('register')}
              >
                Create account
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

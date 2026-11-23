import { useMailboxes } from '../context/MailboxContext';
import { useUi } from '../context/UiContext';
import { useToast } from '../context/ToastContext';
import { IconPlus } from './Icons';
import { cx } from '../lib/cx';

export function FloatingComposeButton() {
  const { active } = useMailboxes();
  const ui = useUi();
  const { toast } = useToast();

  const isExpired = active?.gone === true;

  const handleClick = () => {
    if (!active || isExpired) {
      toast(isExpired ? 'This mailbox has expired. Please select or create an active mailbox.' : 'Please select or create a mailbox first.', 'error');
      return;
    }
    ui.openCompose();
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <button
        type="button"
        onClick={handleClick}
        disabled={!active || isExpired}
        title={isExpired ? 'Mailbox has expired' : !active ? 'No active mailbox' : 'Compose email'}
        className={cx(
          'group flex h-14 w-14 sm:h-14 sm:w-auto sm:px-6 items-center justify-center gap-3 rounded-2xl bg-[#C2E7FF] text-[#001D35] shadow-xl transition-all duration-200 hover:scale-105 hover:bg-[#A8D7FF] hover:shadow-2xl active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-[#C2E7FF] dark:bg-[#004A77] dark:text-[#C2E7FF] dark:hover:bg-[#005C8F]',
        )}
      >
        {/* Gmail colorful/Google styled plus icon */}
        <IconPlus className="h-6 w-6 text-[#001D35] dark:text-[#C2E7FF]" />
        <span
          className="hidden sm:inline font-semibold text-sm tracking-wide"
          style={{ fontFamily: "'Google Sans', sans-serif" }}
        >
          Compose
        </span>
      </button>
    </div>
  );
}

import { useState } from 'react';
import * as api from '../api/endpoints';
import { useMailboxes } from '../context/MailboxContext';
import { useToast } from '../context/ToastContext';
import { IconPencil, IconSend, IconX } from './Icons';
import { focusRing } from './ui';
import { cx } from '../lib/cx';

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

export function ComposeDialog({ open, onClose, onSent }: ComposeDialogProps) {
  const { active } = useMailboxes();
  const { toast } = useToast();

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) {
      toast('Please select or create a mailbox first', 'error');
      return;
    }
    if (!to.trim()) {
      toast('Please enter a recipient email address', 'error');
      return;
    }

    setSending(true);
    try {
      const res = await api.sendEmail(active.id, {
        to: to.trim(),
        subject: subject.trim() || '(No subject)',
        text_body: body,
      });

      if (res.success) {
        toast(`Email sent to ${res.sent_to}!`, 'success');
      } else {
        toast(res.details || 'Message stored in Sent folder (relay not configured)', 'info');
      }

      setTo('');
      setSubject('');
      setBody('');
      onClose();
      onSent?.();
    } catch (err: any) {
      toast(err.message || 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-[#202124] dark:ring-white/10 motion-safe:animate-[slideIn_180ms_ease-out]">
      {/* Header — Gmail Compose bar style */}
      <div className="flex items-center justify-between bg-[#F2F6FC] px-4 py-2.5 dark:bg-[#2d2e30] border-b border-[#E0E2E6] dark:border-[#3c4043]">
        <div className="flex items-center gap-2">
          <IconPencil className="h-4 w-4 text-[#1A73E8] dark:text-[#8ab4f8]" />
          <span className="text-sm font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            New Message
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[#5f6368] hover:bg-[#e0e2e6] hover:text-[#202124] dark:text-[#9aa0a6] dark:hover:bg-[#3c4043] dark:hover:text-white"
          title="Close compose"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSend} className="flex flex-col">
        {/* From address preview */}
        <div className="flex items-center border-b border-[#F0F2F5] px-4 py-2 text-xs text-[#5f6368] dark:border-[#333538] dark:text-[#9aa0a6]">
          <span className="w-12 font-medium">From</span>
          <span className="font-mono text-[#1f1f1f] dark:text-[#c4c7c5]">{active?.address || 'No active mailbox'}</span>
        </div>

        {/* To field */}
        <div className="flex items-center border-b border-[#F0F2F5] px-4 py-2 text-sm dark:border-[#333538]">
          <span className="w-12 text-xs font-medium text-[#5f6368] dark:text-[#9aa0a6]">To</span>
          <input
            type="email"
            required
            placeholder="friend@example.com or name@justjerri.dpdns.org"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#9aa0a6] dark:text-[#e3e3e3]"
            autoFocus
          />
        </div>

        {/* Subject field */}
        <div className="flex items-center border-b border-[#F0F2F5] px-4 py-2 text-sm dark:border-[#333538]">
          <span className="w-12 text-xs font-medium text-[#5f6368] dark:text-[#9aa0a6]">Subject</span>
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#9aa0a6] dark:text-[#e3e3e3]"
          />
        </div>

        {/* Body field */}
        <div className="p-4">
          <textarea
            rows={8}
            placeholder="Write your email here..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-none bg-transparent text-sm text-[#202124] outline-none placeholder:text-[#9aa0a6] dark:text-[#e3e3e3]"
          />
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between border-t border-[#F0F2F5] bg-[#FAFBFD] px-4 py-3 dark:border-[#333538] dark:bg-[#1a1b1e]">
          <button
            type="submit"
            disabled={sending || !active}
            className={cx(
              'flex items-center gap-2 rounded-full bg-[#0B57D0] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[#0842A0] disabled:opacity-50 dark:bg-[#1A73E8] dark:hover:bg-[#1557B0]',
              focusRing,
            )}
          >
            <IconSend className="h-4 w-4" />
            <span>{sending ? 'Sending...' : 'Send'}</span>
          </button>
          <span className="text-xs text-[#5f6368] dark:text-[#9aa0a6]">
            Sends locally or relays via SMTP
          </span>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FaFacebookF, FaTiktok } from 'react-icons/fa6';
import { MessageCircle, Phone, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const CONTACT_ITEMS = [
  {
    label: 'Zalo',
    href: 'https://zalo.me/0812352005',
    icon: MessageCircle,
    color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  },
  {
    label: 'Gọi ngay 0812352005',
    href: 'tel:0812352005',
    icon: Phone,
    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    label: 'Facebook Moly',
    href: 'https://www.facebook.com/share/1DLBbQMv47/?mibextid=wwXIfr',
    icon: FaFacebookF,
    color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  },
  {
    label: 'TikTok @moly_studio01',
    href: 'https://www.tiktok.com/@moly_studio01?_r=1&_t=ZS-98T8bc2zkyS',
    icon: FaTiktok,
    color: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  },
];

export default function FloatingContactMenu({ avoidChatbot = false }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className={`fixed right-3 z-40 flex flex-col items-end gap-2 sm:right-5 ${avoidChatbot ? 'bottom-20 sm:bottom-24' : 'bottom-4 sm:bottom-6'}`}>
      <div
        className={`w-56 origin-bottom-right overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-2 shadow-2xl shadow-slate-950/15 backdrop-blur-xl transition duration-200 dark:border-slate-700/80 dark:bg-slate-900/95 ${open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'}`}
        aria-hidden={!open}
      >
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-xs font-black text-slate-900 dark:text-white">Moly hỗ trợ bạn</p>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Chọn kênh liên hệ thuận tiện</p>
        </div>
        <div className="space-y-1">
          {CONTACT_ITEMS.map(({ label, href, icon: Icon, color }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noreferrer' : undefined}
              tabIndex={open ? 0 : -1}
              className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition group-hover:scale-105 ${color}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="truncate">{label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="group relative">
        {!open && <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100 dark:bg-white dark:text-slate-900">Liên hệ Moly</span>}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Đóng menu liên hệ Moly' : 'Mở menu liên hệ Moly'}
          className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200 dark:border-slate-900 ${open ? 'bg-slate-700 hover:bg-slate-800' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          {!open && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-900" />}
        </button>
      </div>
    </div>
  );
}

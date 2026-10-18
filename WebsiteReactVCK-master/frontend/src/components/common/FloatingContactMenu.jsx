import { useEffect, useState } from 'react';
import { FaFacebookF, FaTiktok } from 'react-icons/fa6';
import { Headphones, MessageCircle, Phone, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const CONTACT_ITEMS = [
  {
    label: 'Zalo',
    href: 'https://zalo.me/0815913408',
    icon: MessageCircle,
    color: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    label: 'Gọi ngay 0815913408',
    href: 'tel:0815913408',
    icon: Phone,
    color: 'bg-cyan-600 hover:bg-cyan-700',
  },
  {
    label: 'Facebook Moly',
    href: 'https://www.facebook.com/share/1DLBbQMv47/?mibextid=wwXIfr',
    icon: FaFacebookF,
    color: 'bg-blue-500 hover:bg-blue-600',
  },
  {
    label: 'TikTok @moly_studio01',
    href: 'https://www.tiktok.com/@moly_studio01?_r=1&_t=ZS-98T8bc2zkyS',
    icon: FaTiktok,
    color: 'bg-rose-500 hover:bg-rose-600',
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
    <div className={`fixed right-4 z-40 flex flex-col items-end gap-2 sm:right-6 ${avoidChatbot ? 'bottom-24 sm:bottom-28' : 'bottom-5 sm:bottom-7'}`}>
      <div className={`flex flex-col items-end gap-2 transition-all duration-200 ${open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`} aria-hidden={!open}>
        {CONTACT_ITEMS.map(({ label, href, icon: Icon, color }) => (
          <a
            key={label}
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noreferrer' : undefined}
            tabIndex={open ? 0 : -1}
            className="group flex items-center gap-2.5"
          >
            <span className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur transition group-hover:-translate-x-0.5">
              {label}
            </span>
            <span className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white/80 transition group-hover:scale-105 dark:ring-slate-950/80 ${color}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          </a>
        ))}
      </div>

      <div className="relative">
        {!open && (
          <span className="absolute -left-20 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white shadow-lg">
            Liên hệ Moly
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Đóng menu liên hệ Moly' : 'Mở menu liên hệ Moly'}
          className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white text-white shadow-2xl transition hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-300 dark:border-slate-900 ${open ? 'rotate-0 bg-slate-700 hover:bg-slate-800' : 'bg-gradient-to-br from-rose-500 to-red-700 hover:rotate-3'}`}
        >
          {open ? <X className="h-6 w-6" /> : <Headphones className="h-6 w-6" />}
        </button>
      </div>
    </div>
  );
}

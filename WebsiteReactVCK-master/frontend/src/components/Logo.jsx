import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Logo({ isTransparent = false }) {
  return (
    <Link
      to="/"
      aria-label="CSCA Academy - Trang chủ"
      className="group flex shrink-0 items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg shadow-red-950/20 transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
        <span className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-amber-300/50 blur-sm" />
        <GraduationCap className="relative h-5 w-5" aria-hidden="true" />
      </span>
      <span className="leading-none">
        <span className={`block text-base font-black tracking-tight transition-colors sm:text-lg ${isTransparent ? 'text-white' : 'text-gray-950 dark:text-white'}`}>
          CSCA
        </span>
        <span className={`mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] transition-colors ${isTransparent ? 'text-amber-200' : 'text-red-600 dark:text-amber-400'}`}>
          Academy
        </span>
      </span>
    </Link>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiMenu, FiMoon, FiSun } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Home as HomeIcon,
  Flame,
  Presentation,
  UsersRound,
  BookCheck,
  ChevronDown,
  Settings,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Bookmark,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import '../i18n';
import Logo from './Logo';
import VNFlag from '../assets/VN.png';
import UKFlag from '../assets/UK.png';
import AuthModal from './auth/AuthModal';
import { useAuthContext } from '../context/AuthContext';
import useLogout from '../hooks/useLogout';
import SearchNavbar from './SearchNavbar';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import NotificationBell from '../features/notifications/components/NotificationBell';

/* ══════════════════════════════════════════════════════════════
   ROLE-BASED NAVIGATION CONFIG
   Roles: admin | creator (giao vien) | student (default)
   ══════════════════════════════════════════════════════════════ */

// Ai cung thay (ke ca guest)
const PUBLIC_LINKS = [
  { label: 'Trang chủ', path: '/', icon: HomeIcon },
  { label: 'Khóa học', path: '/courses', icon: GraduationCap },
  { label: 'Bảng xếp hạng', path: '/rank', icon: Flame },
  { label: 'Cộng đồng', path: '/post', icon: UsersRound },
];

// Chi creator (giao vien) va admin moi thay
const TEACHER_LINKS = [
  { label: 'Teacher Hub', description: 'Tổng quan lớp giảng dạy', icon: Presentation, path: '/lms/teach' },
  { label: 'Quản lý giáo trình', description: 'Thêm chương học và video R2', icon: BookCheck, path: '/lms/teacher/curriculum' },
  { label: 'Chấm điểm bài nộp', description: 'Chấm bài viết & audio HSKK', icon: ClipboardCheck, path: '/lms/teacher/grading' },
];

// Chi admin moi thay
const ADMIN_LINKS = [
  { label: 'Admin Dashboard', description: 'Thống kê toàn hệ thống', icon: LayoutDashboard, path: '/admin' },
  { label: 'Quản lý người dùng', description: 'Users, roles, quyền truy cập', icon: Users, path: '/admin/users' },
  { label: 'Quản lý khóa học', description: 'CRUD courses toàn bộ', icon: BookOpen, path: '/admin/courses' },
];

/* ── Helpers ──────────────────────────────────────────────────── */
function isTeacher(user) {
  return user && (user.role === 'creator' || user.role === 'admin');
}
function isAdmin(user) {
  return user && user.role === 'admin';
}
function getRoleBadge(user) {
  if (!user) return null;
  if (user.role === 'admin') return { label: 'Admin', cls: 'bg-red-500/20 text-red-400 border-red-500/30' };
  if (user.role === 'creator') return { label: 'Giáo Viên', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  return { label: 'Học Viên', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/30' };
}

const Navbar = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useTheme();
  const { authUser } = useAuthContext();
  const { logout } = useLogout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Auto-hide on scroll
  useEffect(() => {
    let raf = null;
    const update = () => {
      const y = Math.max(window.scrollY, 0);
      if (y <= 20) { setIsNavbarVisible(true); lastScrollY.current = y; raf = null; return; }
      if (Math.abs(y - lastScrollY.current) < 10) { raf = null; return; }
      setIsNavbarVisible(y < lastScrollY.current);
      lastScrollY.current = y;
      raf = null;
    };
    const onScroll = () => { if (raf === null) raf = requestAnimationFrame(update); };
    lastScrollY.current = Math.max(window.scrollY, 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf !== null) cancelAnimationFrame(raf); };
  }, []);

  // Close menus on route change
  useEffect(() => {
    setIsMenuOpen(false); setDesktopMenu(null); setShowLangMenu(false); setShowProfileMenu(false); setIsNavbarVisible(true);
  }, [location.pathname]);

  // Auth-required screens can send the guest back here with a login intent.
  // Consume the intent once so refreshes do not reopen the modal forever.
  useEffect(() => {
    const requestedMode = location.state?.openAuthModal;
    if (!requestedMode) return;

    setAuthMode(requestedMode);
    setIsAuthModalOpen(true);
    window.history.replaceState({}, '', `${location.pathname}${location.search}${location.hash}`);
  }, [location]);

  // Close mobile menu on desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const h = (e) => { if (e.matches) setIsMenuOpen(false); };
    if (mq.matches) setIsMenuOpen(false);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const openAuthModal = (mode) => { setAuthMode(mode); setIsAuthModalOpen(true); };

  /* ── Build nav links by role ────────────────────────────────── */
  const mainNavLinks = [
    ...PUBLIC_LINKS,
  ];

  const navItemClass = (active = false) =>
    `relative inline-flex h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-xs font-bold transition-colors ${
      active
        ? 'border-red-600 text-red-600 dark:border-amber-400 dark:text-amber-300'
        : 'border-transparent text-slate-600 hover:border-red-200 hover:text-red-600 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:text-amber-300'
    }`;

  const renderDesktopDropdown = (items, sectionLabel) => (
    <div className="absolute left-1/2 top-full w-80 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white z-50">
      {sectionLabel && (
        <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{sectionLabel}</p>
      )}
      {items.map(({ label, description, icon: Icon, path }) => (
        path ? (
          <Link key={label} to={path} onClick={() => setDesktopMenu(null)}
            className="flex w-full items-start gap-3 rounded-xl bg-transparent p-3 text-left transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10 dark:hover:text-amber-300">
            <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
            <span><strong className="block text-sm">{label}</strong><small className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{description}</small></span>
          </Link>
        ) : (
          <button key={label} type="button" onClick={() => { setDesktopMenu(null); toast(`${label} đang phát triển.`); }}
            className="flex w-full items-start gap-3 rounded-xl bg-transparent p-3 text-left transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10 dark:hover:text-amber-300">
            <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
            <span><strong className="block text-sm">{label}</strong><small className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{description}</small></span>
          </button>
        )
      ))}
    </div>
  );

  const roleBadge = getRoleBadge(authUser);
  const navbarMustStayVisible = isNavbarVisible || isMenuOpen || desktopMenu || showLangMenu || showProfileMenu || isAuthModalOpen;

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 transform-gpu transition-transform duration-300 ease-out ${navbarMustStayVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <nav className="border-b border-slate-200/80 bg-white/95 text-slate-950 shadow-lg shadow-slate-950/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white" aria-label="Main navigation">
          <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-8 divide-y divide-slate-100 dark:divide-slate-800/60">

            {/* ═══ TOP ROW: Logo | Search | Actions ═══ */}
            <div className="flex h-16 items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <Logo />
                <div className="hidden min-w-[240px] max-w-sm flex-1 lg:block">
                  <SearchNavbar />
                </div>
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2">
                {/* Notification - chi user dang nhap */}
                {authUser && <NotificationBell />}

                {/* Theme Toggle */}
                <button type="button" onClick={toggleTheme}
                  className="rounded-xl bg-transparent p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-white/10"
                  title={isDarkMode ? t('lightMode') : t('darkMode')}>
                  {isDarkMode ? <FiSun className="h-5 w-5 text-amber-400" /> : <FiMoon className="h-5 w-5" />}
                </button>

                {/* Language */}
                <div className="relative hidden sm:block">
                  <button type="button" onClick={() => setShowLangMenu(c => !c)}
                    className="flex items-center gap-2 rounded-xl bg-transparent px-2 py-2 text-xs font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-white/10">
                    <img src={i18n.language === 'vi' ? VNFlag : UKFlag} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
                    <span>{i18n.language.toUpperCase()}</span>
                  </button>
                  {showLangMenu && (
                    <div className="absolute right-0 mt-2 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white z-50">
                      {[{ code: 'vi', flag: VNFlag, label: 'Tiếng Việt' }, { code: 'en', flag: UKFlag, label: 'English' }].map(lng => (
                        <button key={lng.code} type="button" onClick={() => { i18n.changeLanguage(lng.code); setShowLangMenu(false); }}
                          className="flex w-full items-center gap-3 rounded-xl bg-transparent px-3 py-2 text-left text-xs font-semibold transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">
                          <img src={lng.flag} alt="" className="h-3.5 w-5 rounded-sm object-cover" /> {lng.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* User / Auth */}
                {authUser ? (
                  <div className="relative">
                    <button type="button" onClick={() => setShowProfileMenu(c => !c)}
                      className="flex items-center gap-2 rounded-full bg-transparent p-0.5 transition hover:opacity-85">
                      <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username}
                        className="h-9 w-9 rounded-full border-2 border-white object-cover shadow-sm dark:border-slate-700" />
                    </button>
                    {showProfileMenu && (
                      <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white z-50">
                        {/* User Info Header */}
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{authUser.fullName || authUser.username}</p>
                          <p className="text-[11px] text-slate-500 truncate">@{authUser.username}</p>
                          {roleBadge && (
                            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadge.cls}`}>
                              {roleBadge.label}
                            </span>
                          )}
                        </div>

                        {/* Student links */}
                        <Link to="/profile" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">
                          <Settings className="h-3.5 w-3.5" /> {t('profileLink')}
                        </Link>
                        <Link to="/lms/my-learning" className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300">
                          <Bookmark className="h-3.5 w-3.5" /> Vào LMS học viên
                        </Link>

                        {/* Teacher links - chi creator va admin */}
                        {isTeacher(authUser) && (
                          <>
                            <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-800" />
                            <p className="px-4 pt-1.5 pb-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Giảng Dạy</p>
                            <Link to="/lms/teach" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-white/10">
                              <Presentation className="h-3.5 w-3.5" /> Teacher Hub
                            </Link>
                            <Link to="/lms/admin/grading" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">
                              <ClipboardCheck className="h-3.5 w-3.5" /> Chấm điểm bài nộp
                            </Link>
                          </>
                        )}

                        {/* Admin links - chi admin */}
                        {isAdmin(authUser) && (
                          <>
                            <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-800" />
                            <p className="px-4 pt-1.5 pb-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">Quản Trị</p>
                            <Link to="/admin" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-white/10">
                              <ShieldCheck className="h-3.5 w-3.5" /> {t('admin')}
                            </Link>
                          </>
                        )}

                        <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-800" />
                        <button type="button" onClick={() => { logout(); setShowProfileMenu(false); }}
                          className="flex w-full items-center gap-2 rounded-xl bg-transparent px-4 py-2.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-white/10">
                          <IoClose className="h-3.5 w-3.5" /> {t('logout')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="hidden items-center gap-1.5 md:flex">
                    <button type="button" onClick={() => openAuthModal('login')}
                      className="rounded-xl bg-transparent px-3 py-2 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-white/10">
                      {t('login')}
                    </button>
                    <button type="button" onClick={() => openAuthModal('register')}
                      className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-red-950/15 transition hover:bg-red-500">
                      Đăng ký
                    </button>
                  </div>
                )}

                {/* Mobile menu toggle */}
                <button type="button" onClick={() => setIsMenuOpen(c => !c)}
                  className="rounded-xl bg-transparent p-2 text-slate-600 transition hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-white/10 xl:hidden">
                  {isMenuOpen ? <IoClose className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
                </button>
              </div>
            </div>

            {/* ═══ BOTTOM ROW: Desktop Navigation ═══ */}
            <div className="hidden xl:flex h-11 items-center justify-center gap-1 overflow-visible">
              {/* Public + student main links */}
              {mainNavLinks.map(({ label, path, icon: Icon }) => (
                <Link key={path} to={path} className={navItemClass(location.pathname === path)}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </Link>
              ))}

              {/* LMS là khu vực riêng, chỉ thêm một lối vào cho học viên đã đăng nhập */}
              {authUser && (
                <Link
                  to="/lms/my-learning"
                  className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-black text-white shadow-sm transition hover:bg-slate-700 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300"
                >
                  <BookOpen className="h-3.5 w-3.5" /> LMS học viên
                </Link>
              )}

              {/* Giang day dropdown - chi teacher/admin */}
              {isTeacher(authUser) && (
                <div className="relative h-11" onMouseEnter={() => setDesktopMenu('teaching')} onMouseLeave={() => setDesktopMenu(null)}>
                  <button type="button" onClick={() => setDesktopMenu(c => c === 'teaching' ? null : 'teaching')}
                    className={navItemClass(desktopMenu === 'teaching')}>
                    <Presentation className="h-3.5 w-3.5" /> Giảng dạy <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </button>
                  {desktopMenu === 'teaching' && renderDesktopDropdown(TEACHER_LINKS, 'Giáo Viên')}
                </div>
              )}

              {/* Quan tri dropdown - chi admin */}
              {isAdmin(authUser) && (
                <div className="relative h-11" onMouseEnter={() => setDesktopMenu('admin')} onMouseLeave={() => setDesktopMenu(null)}>
                  <button type="button" onClick={() => setDesktopMenu(c => c === 'admin' ? null : 'admin')}
                    className={navItemClass(desktopMenu === 'admin')}>
                    <ShieldCheck className="h-3.5 w-3.5 text-red-500" /> Quản trị <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </button>
                  {desktopMenu === 'admin' && renderDesktopDropdown(ADMIN_LINKS, 'Hệ Thống')}
                </div>
              )}
            </div>

          </div>

          {/* ═══ MOBILE DRAWER ═══ */}
          {isMenuOpen && (
            <div id="mobile-navigation" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-5 pt-3 text-slate-900 shadow-xl dark:border-white/10 dark:bg-slate-950 dark:text-white xl:hidden">
              <div className="mx-auto max-w-7xl space-y-1">

                {/* Search on mobile */}
                <div className="pb-3 lg:hidden">
                  <SearchNavbar />
                </div>

                {/* Public links */}
                <p className="px-4 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Trang Chính</p>
                {PUBLIC_LINKS.map(({ label, path, icon: Icon }) => (
                  <Link key={path} to={path} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                ))}

                {/* Separate LMS entry point for online students */}
                {authUser && (
                  <>
                    <p className="px-4 pb-1 pt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Khu vực học viên</p>
                    <Link to="/lms/my-learning" className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300">
                      <span className="flex items-center gap-3"><GraduationCap className="h-4 w-4" /> Vào LMS học viên</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </>
                )}

                {/* Teacher links - chi teacher/admin */}
                {isTeacher(authUser) && (
                  <>
                    <p className="px-4 pb-1 pt-4 text-[10px] font-black uppercase tracking-widest text-emerald-500">Giảng Dạy</p>
                    {TEACHER_LINKS.map(({ label, icon: Icon, path }) => (
                      <Link key={label} to={path} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-white/10">
                        <Icon className="h-4 w-4" /> {label}
                      </Link>
                    ))}
                  </>
                )}

                {/* Admin links - chi admin */}
                {isAdmin(authUser) && (
                  <>
                    <p className="px-4 pb-1 pt-4 text-[10px] font-black uppercase tracking-widest text-red-400">Quản Trị Hệ Thống</p>
                    {ADMIN_LINKS.map(({ label, icon: Icon, path }) => (
                      <Link key={label} to={path} className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-white/10">
                        <Icon className="h-4 w-4" /> {label}
                      </Link>
                    ))}
                  </>
                )}

                {/* Auth buttons cho guest */}
                {!authUser && (
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    <button type="button" onClick={() => openAuthModal('login')}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-slate-900">
                      {t('login')}
                    </button>
                    <button type="button" onClick={() => openAuthModal('register')}
                      className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white">
                      Đăng ký
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
    </>
  );
};

export default Navbar;

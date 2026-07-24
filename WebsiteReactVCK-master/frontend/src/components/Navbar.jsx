import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiMenu, FiMoon, FiSun } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import {
  Bell,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Home as HomeIcon,
  Library,
  Presentation,
  School,
  UsersRound,
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

const learningItems = [
  { label: 'Nơi học tập', description: 'Không gian học và tiến độ cá nhân', icon: Library },
  { label: 'Lịch học', description: 'Theo dõi lịch học sắp tới', icon: School },
  { label: 'Bài tập của tôi', description: 'Bài tập được giảng viên giao', icon: ClipboardCheck },
];

const teachingItems = [
  { label: 'Lớp giảng dạy', description: 'Quản lý các lớp đang phụ trách', icon: Presentation },
  { label: 'Giao bài tập', description: 'Tạo và giao bài cho học viên', icon: ClipboardCheck },
  { label: 'Quản lý học viên', description: 'Theo dõi kết quả từng học viên', icon: UsersRound },
];

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

  useEffect(() => {
    let animationFrame = null;

    const updateNavbar = () => {
      const currentScrollY = Math.max(window.scrollY, 0);
      const scrollDifference = currentScrollY - lastScrollY.current;

      if (currentScrollY <= 80) setIsNavbarVisible(true);
      else if (scrollDifference > 5) setIsNavbarVisible(false);
      else if (scrollDifference < -5) setIsNavbarVisible(true);

      lastScrollY.current = currentScrollY;
      animationFrame = null;
    };

    const handleScroll = () => {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(updateNavbar);
    };

    lastScrollY.current = Math.max(window.scrollY, 0);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setDesktopMenu(null);
    setShowLangMenu(false);
    setShowProfileMenu(false);
    setIsNavbarVisible(true);
  }, [location.pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1280px)');
    const handleDesktopChange = (event) => {
      if (event.matches) setIsMenuOpen(false);
    };

    if (desktopQuery.matches) setIsMenuOpen(false);
    desktopQuery.addEventListener('change', handleDesktopChange);
    return () => desktopQuery.removeEventListener('change', handleDesktopChange);
  }, []);

  const openAuthModal = (mode) => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  const showComingSoon = (label) => {
    setDesktopMenu(null);
    setIsMenuOpen(false);
    toast(`${label} đang được phát triển và sẽ sớm mở.`);
  };

  const primaryLinks = [
    { label: t('home'), path: '/', icon: HomeIcon },
    { label: t('courses'), path: '/courses', icon: GraduationCap },
  ];

  const secondaryLinks = [
    { label: 'Tài liệu', icon: FileText },
    { label: 'Cộng đồng', path: '/post', icon: UsersRound },
  ];

  const navItemClass = (active = false) =>
    `relative inline-flex h-16 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-[13px] font-bold transition-colors ${
      active
        ? 'border-red-600 text-red-600 dark:border-amber-400 dark:text-amber-300'
        : 'border-transparent text-slate-600 hover:border-red-200 hover:text-red-600 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:text-amber-300'
    }`;

  const renderDesktopDropdown = (items) => (
    <div className="absolute left-1/2 top-full w-80 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-slate-800 shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      {items.map(({ label, description, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => showComingSoon(label)}
          className="flex w-full items-start gap-3 rounded-xl bg-transparent p-3 text-left transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10 dark:hover:text-amber-300"
        >
          <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
          <span><strong className="block text-sm">{label}</strong><small className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">{description}</small></span>
        </button>
      ))}
    </div>
  );

  const navbarMustStayVisible = isNavbarVisible || isMenuOpen || desktopMenu || showLangMenu || showProfileMenu || isAuthModalOpen;

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 transform-gpu transition-transform duration-300 ease-out ${navbarMustStayVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <nav className="border-b border-slate-200/80 bg-white/95 text-slate-950 shadow-lg shadow-slate-950/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white" aria-label="Điều hướng chính">
          <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center gap-4">
              <Logo />

              <div className="hidden min-w-[210px] max-w-sm flex-1 lg:block">
                <SearchNavbar />
              </div>

              <div className="ml-auto hidden h-16 items-center gap-1 xl:flex">
                {primaryLinks.map(({ label, path, icon: Icon }) => (
                  <Link key={path} to={path} className={navItemClass(location.pathname === path)}>
                    <Icon className="h-4 w-4" /> {label}
                  </Link>
                ))}

                <div className="relative h-16" onMouseEnter={() => setDesktopMenu('learning')} onMouseLeave={() => setDesktopMenu(null)}>
                  <button type="button" onClick={() => setDesktopMenu((current) => current === 'learning' ? null : 'learning')} className={navItemClass(desktopMenu === 'learning')} aria-expanded={desktopMenu === 'learning'}>
                    <BookOpen className="h-4 w-4" /> Học tập
                  </button>
                  {desktopMenu === 'learning' && renderDesktopDropdown(learningItems)}
                </div>

                <div className="relative h-16" onMouseEnter={() => setDesktopMenu('teaching')} onMouseLeave={() => setDesktopMenu(null)}>
                  <button type="button" onClick={() => setDesktopMenu((current) => current === 'teaching' ? null : 'teaching')} className={navItemClass(desktopMenu === 'teaching')} aria-expanded={desktopMenu === 'teaching'}>
                    <Presentation className="h-4 w-4" /> Giảng dạy
                  </button>
                  {desktopMenu === 'teaching' && renderDesktopDropdown(teachingItems)}
                </div>

                {secondaryLinks.map(({ label, path, icon: Icon }) => path ? (
                  <Link key={label} to={path} className={navItemClass(location.pathname === path)}><Icon className="h-4 w-4" /> {label}</Link>
                ) : (
                  <button key={label} type="button" onClick={() => showComingSoon(label)} className={navItemClass(false)}><Icon className="h-4 w-4" /> {label}</button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-1 xl:ml-0">
                <button type="button" onClick={() => showComingSoon('Thông báo')} className="relative rounded-xl bg-transparent p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Thông báo">
                  <Bell className="h-5 w-5" />
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-950" />
                </button>

                <button type="button" onClick={toggleTheme} className="rounded-xl bg-transparent p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-white/10" title={isDarkMode ? t('lightMode') : t('darkMode')} aria-label={isDarkMode ? t('lightMode') : t('darkMode')}>
                  {isDarkMode ? <FiSun className="h-5 w-5 text-amber-400" /> : <FiMoon className="h-5 w-5" />}
                </button>

                <div className="relative hidden sm:block">
                  <button type="button" onClick={() => setShowLangMenu((current) => !current)} className="flex items-center gap-2 rounded-xl bg-transparent px-2 py-2 text-sm font-bold text-slate-600 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-white/10" aria-expanded={showLangMenu} aria-haspopup="menu" aria-label="Chọn ngôn ngữ">
                    <img src={i18n.language === 'vi' ? VNFlag : UKFlag} alt="" className="h-4 w-6 rounded-sm object-cover" />
                    <span>{i18n.language.toUpperCase()}</span>
                  </button>
                  {showLangMenu && (
                    <div role="menu" className="absolute right-0 mt-2 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      {[{ code: 'vi', flag: VNFlag, label: 'Tiếng Việt' }, { code: 'en', flag: UKFlag, label: 'English' }].map((language) => (
                        <button key={language.code} type="button" role="menuitem" onClick={() => { i18n.changeLanguage(language.code); setShowLangMenu(false); }} className="flex w-full items-center gap-3 rounded-xl bg-transparent px-3 py-2 text-left text-sm font-semibold transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">
                          <img src={language.flag} alt="" className="h-4 w-6 rounded-sm object-cover" /> {language.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {authUser ? (
                  <div className="relative">
                    <button type="button" onClick={() => setShowProfileMenu((current) => !current)} className="rounded-full bg-transparent p-0.5 transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400" aria-expanded={showProfileMenu} aria-haspopup="menu" aria-label="Mở menu tài khoản">
                      <img src={getAvatarUrl(authUser)} onError={handleAvatarError} alt={authUser.username} className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm dark:border-slate-700" />
                    </button>
                    {showProfileMenu && (
                      <div role="menu" className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <Link to="/profile" role="menuitem" className="block rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">{t('profileLink')}</Link>
                        {(authUser.role === 'admin' || authUser.role === 'creator') && <Link to="/admin" role="menuitem" className="block rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10">{t('admin')}</Link>}
                        <button type="button" role="menuitem" onClick={() => { logout(); setShowProfileMenu(false); }} className="block w-full rounded-xl bg-transparent px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-white/10">{t('logout')}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="hidden items-center gap-1 md:flex">
                    <button type="button" onClick={() => openAuthModal('login')} className="rounded-xl bg-transparent px-3 py-2 text-sm font-bold text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-white/10">{t('login')}</button>
                    <button type="button" onClick={() => openAuthModal('register')} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-red-950/15 transition hover:bg-red-500">Đăng ký</button>
                  </div>
                )}

                <button type="button" onClick={() => setIsMenuOpen((current) => !current)} className="rounded-xl bg-transparent p-2 text-slate-600 transition hover:bg-red-50 hover:text-red-700 dark:text-slate-300 dark:hover:bg-white/10 xl:hidden" aria-expanded={isMenuOpen} aria-controls="mobile-navigation" aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}>
                  {isMenuOpen ? <IoClose className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>

          {isMenuOpen && (
            <div id="mobile-navigation" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-5 pt-3 text-slate-900 shadow-xl dark:border-white/10 dark:bg-slate-950 dark:text-white xl:hidden">
              <div className="mx-auto max-w-7xl space-y-1">
                {primaryLinks.map(({ label, path, icon: Icon }) => <Link key={path} to={path} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10"><Icon className="h-4 w-4" /> {label}</Link>)}
                <p className="px-4 pb-1 pt-4 text-xs font-black uppercase tracking-widest text-slate-400">Học tập</p>
                {learningItems.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => showComingSoon(label)} className="flex w-full items-center gap-3 rounded-xl bg-transparent px-4 py-3 text-left text-sm font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10"><Icon className="h-4 w-4" /> {label}</button>)}
                <p className="px-4 pb-1 pt-4 text-xs font-black uppercase tracking-widest text-slate-400">Giảng dạy</p>
                {teachingItems.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => showComingSoon(label)} className="flex w-full items-center gap-3 rounded-xl bg-transparent px-4 py-3 text-left text-sm font-semibold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10"><Icon className="h-4 w-4" /> {label}</button>)}
                {secondaryLinks.map(({ label, path, icon: Icon }) => path ? <Link key={label} to={path} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10"><Icon className="h-4 w-4" /> {label}</Link> : <button key={label} type="button" onClick={() => showComingSoon(label)} className="flex w-full items-center gap-3 rounded-xl bg-transparent px-4 py-3 text-left text-sm font-bold hover:bg-red-50 hover:text-red-700 dark:hover:bg-white/10"><Icon className="h-4 w-4" /> {label}</button>)}
                {!authUser && <div className="grid grid-cols-2 gap-2 pt-4"><button type="button" onClick={() => openAuthModal('login')} className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-slate-900">{t('login')}</button><button type="button" onClick={() => openAuthModal('register')} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white">Đăng ký</button></div>}
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

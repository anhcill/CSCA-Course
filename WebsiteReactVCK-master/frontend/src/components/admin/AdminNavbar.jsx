/* eslint-disable react/prop-types */
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiMenu, FiSun, FiMoon, FiUser, FiHome, FiLogOut } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useAuthContext } from '../../context/AuthContext';
import useLogout from '../../hooks/useLogout';
import Logo from '../Logo';
import VNFlag from '../../assets/VN.png';
import UKFlag from '../../assets/UK.png';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

const AdminNavbar = ({ toggleSidebar }) => {
  const { t, i18n } = useTranslation();
  const { isDarkMode, toggleTheme } = useTheme();
  const { authUser } = useAuthContext();
  const { logout } = useLogout();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const langRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) {
        setShowLangMenu(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    setShowLangMenu(false);
  };

  return (
    <nav className="fixed top-0 left-0 w-full h-16 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-800 shadow-sm transition-colors">
      <div className="w-full h-full px-4 sm:px-6 flex items-center justify-between">
        {/* Left: Sidebar toggle + Logo */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 transition"
            title="Bật/Tắt Menu Sidebar"
            aria-label="Toggle Sidebar"
          >
            <FiMenu className="h-5 w-5" />
          </button>

          <Link to="/admin/dashboard" className="flex items-center gap-2.5">
            <Logo className="h-8" />
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Admin Console
            </span>
          </Link>
        </div>

        {/* Right: Theme Toggle, Language Selector, User Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 transition"
            title={isDarkMode ? t('lightMode') : t('darkMode')}
            aria-label="Toggle Theme"
          >
            {isDarkMode ? (
              <FiSun className="h-4 w-4 text-amber-400" />
            ) : (
              <FiMoon className="h-4 w-4 text-gray-600" />
            )}
          </button>

          {/* Language Selector */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center space-x-1.5 bg-gray-100 dark:bg-slate-800 text-xs font-bold text-gray-700 dark:text-slate-300 rounded-xl px-3 py-2 hover:bg-gray-200 dark:hover:bg-slate-700 transition"
            >
              <img
                src={i18n.language === 'vi' ? VNFlag : UKFlag}
                alt={i18n.language?.toUpperCase()}
                className="w-4 h-3 object-cover rounded-sm"
              />
              <span>{i18n.language?.toUpperCase() || 'VI'}</span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-50 animate-fade-in text-xs">
                <button
                  type="button"
                  onClick={() => changeLanguage('vi')}
                  className="flex items-center space-x-2 w-full px-3 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                >
                  <img src={VNFlag} alt="VN" className="w-4 h-3 object-cover rounded-sm" />
                  <span>Tiếng Việt</span>
                </button>
                <button
                  type="button"
                  onClick={() => changeLanguage('en')}
                  className="flex items-center space-x-2 w-full px-3 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                >
                  <img src={UKFlag} alt="UK" className="w-4 h-3 object-cover rounded-sm" />
                  <span>English</span>
                </button>
              </div>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center rounded-full hover:ring-2 hover:ring-blue-500/50 transition focus:outline-none"
            >
              <img
                src={getAvatarUrl(authUser)}
                onError={handleAvatarError}
                alt={authUser?.username || 'User'}
                className="h-9 w-9 rounded-full object-cover border border-gray-200 dark:border-slate-700 shadow-sm"
              />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl py-2 border border-gray-100 dark:border-slate-800 z-50 animate-fade-in">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-800 mb-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {authUser?.fullName || authUser?.username}
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">{authUser?.email}</p>
                </div>

                <Link
                  to="/profile"
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <FiUser className="w-4 h-4 text-gray-400" />
                  <span>{t('profileLink')}</span>
                </Link>

                <Link
                  to="/"
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <FiHome className="w-4 h-4 text-gray-400" />
                  <span>{t('home')}</span>
                </Link>

                <div className="border-t border-gray-100 dark:border-slate-800 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setShowProfileMenu(false);
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                  >
                    <FiLogOut className="w-4 h-4" />
                    <span>{t('logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;
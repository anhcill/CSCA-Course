import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaFacebook, FaTiktok } from 'react-icons/fa6';
import { HiPhone } from 'react-icons/hi';
import { MessageCircle } from 'lucide-react';
import Logo from './Logo';

const Footer = () => {
  const { t } = useTranslation();

  const menuItems = [
    { title: t('home'), path: '/' },
    { title: t('courses'), path: '/courses' },
    { title: t('post'), path: '/post' },
    { title: t('about'), path: '/about' },
    { title: t('p&l'), path: '/policy-and-legal' },
  ];

  return (
    <footer className="border-t border-gray-100 bg-white pb-8 pt-16 dark:border-white/10 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.2fr_.8fr_1fr]">
          <div>
            <Logo />
            <p className="mt-6 max-w-md text-sm leading-7 text-gray-600 dark:text-gray-400">{t('about_description')}</p>
            <div className="mt-6 flex gap-3">
              <a href="https://www.tiktok.com/@moly_studio01?_r=1&_t=ZS-98T8bc2zkyS" target="_blank" rel="noreferrer" className="rounded-full border border-gray-200 p-2.5 text-gray-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-800 dark:text-gray-400 dark:hover:border-amber-400 dark:hover:bg-amber-400/10 dark:hover:text-amber-300" title="TikTok MOLY COURSE">
                <FaTiktok className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">TikTok MOLY COURSE</span>
              </a>
              <a href="https://www.facebook.com/share/1DLBbQMv47/?mibextid=wwXIfr" target="_blank" rel="noreferrer" className="rounded-full border border-gray-200 p-2.5 text-gray-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-gray-800 dark:text-gray-400 dark:hover:border-amber-400 dark:hover:bg-amber-400/10 dark:hover:text-amber-300" title="Facebook MOLY COURSE">
                <FaFacebook className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Facebook MOLY COURSE</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-950 dark:text-white">{t('categories')}</h3>
            <ul className="mt-5 space-y-3">
              {menuItems.map((item) => (
                <li key={item.path}>
                  <Link to={item.path} className="text-sm font-semibold text-gray-600 transition hover:text-red-600 dark:text-gray-400 dark:hover:text-amber-400">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-950 dark:text-white">{t('contact_info')}</h3>
            <div className="mt-5 space-y-3">
              <a href="tel:0815913408" className="flex items-center gap-3 rounded-2xl border border-gray-100 p-4 text-sm font-semibold text-gray-700 transition hover:border-red-100 hover:bg-red-50 hover:text-red-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-red-900 dark:hover:bg-red-950/20 dark:hover:text-amber-300">
                <HiPhone className="h-5 w-5 text-red-600 dark:text-amber-400" aria-hidden="true" />
                0815913408
              </a>
              <a href="https://zalo.me/0815913408" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-red-600 p-4 text-sm font-black text-white transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                Tư vấn qua Zalo
              </a>
              <p className="px-1 text-xs leading-5 text-gray-500 dark:text-gray-500">Tư vấn chương trình, lộ trình học và thông tin đăng ký qua Zalo 0815913408.</p>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">{t('copyright')}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lottie } from 'lottie-react';
import { Home, ArrowLeft } from 'lucide-react';
import Meta from '../../components/Meta';
import notFoundAnimation from '../../assets/404-blue.json';

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-slate-900 px-4 py-12 transition-colors">
      <Meta
        title={t("notFoundMetaTitle") || "404 - Không tìm thấy trang | Moly Course"}
        description={t("notFoundMetaDescription") || "Trang bạn tìm kiếm không tồn tại trên Moly Course."}
        keywords={t("notFoundMetaKeywords") || "404, not found, moly course"}
        noindex={true}
      />
      <div className="w-full max-w-lg mx-auto flex flex-col items-center text-center">
        {/* Lottie Animation 404 Robot */}
        <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 filter drop-shadow-xl select-none pointer-events-none">
          <Lottie
            src={notFoundAnimation}
            loop={true}
            autoplay={true}
            className="w-full h-full"
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          {t('not_found.title') || "Không tìm thấy trang"}
        </h1>

        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-md">
          {t('not_found.message') || "Đường dẫn bạn truy cập có thể không đúng, đã bị xóa hoặc tạm thời không thể kết nối."}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all duration-200"
          >
            <Home className="w-4 h-4" />
            {t('not_found.back_home') || "Về trang chủ"}
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
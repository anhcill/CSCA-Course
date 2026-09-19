import React, { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Headphones,
  Landmark,
  MessageCircle,
  Plane,
  School,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Loading from '../../components/Loading';
import Meta from '../../components/Meta.jsx';

const FeedBack = React.lazy(() => import('../../components/FeedBack'));

const commonsImage = (fileName, width = 1600) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;

const HOME_IMAGES = {
  tsinghua: commonsImage('Main building of Tsinghua University.JPG'),
  peking: commonsImage('West gate of Peking University (20180418180213).jpg'),
  nanjing: commonsImage('Main building university of Nanking 2018.jpg'),
  tongji: commonsImage('Tongji University Library - Flickr - mripp.jpg'),
  wuhan: commonsImage('Administrative Building of Wuhan University.jpg'),
  wuhanSakura: commonsImage('Sakura Area in Wuhan University.jpg'),
  chineseStudents: commonsImage('Yuyendaxue campus students.jpg'),
  greatWall: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1600&q=85',
};

const handleImageError = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied) return;
  image.dataset.fallbackApplied = 'true';
  image.src = HOME_IMAGES.greatWall;
};

// ─── Hero slides ────────────────────────────────────────────────────────────────
const heroSlides = [
  {
    title: 'Chinh phục tiếng Trung, mở lối du học Trung Quốc',
    subtitle: 'Lộ trình từ cơ bản đến HSK, HSKK chuyên sâu, kết hợp tư vấn học bổng và hỗ trợ hồ sơ du học trọn vẹn.',
    badge: '95% đạt học bổng',
    icon: Target,
    bgImage: HOME_IMAGES.chineseStudents,
    accentColor: 'from-red-500 to-amber-500',
  },
  {
    title: 'Tự tin bước vào kỳ thi HSK với lộ trình chuẩn',
    subtitle: 'Giáo trình hệ thống, lớp học tương tác và bài luyện tập bám sát mục tiêu giúp bạn tiến bộ qua từng giai đoạn.',
    badge: '10,000+ học viên',
    icon: TrendingUp,
    bgImage: HOME_IMAGES.chineseStudents,
    accentColor: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Biến mục tiêu du học thành kế hoạch khả thi',
    subtitle: 'Từ chọn trường, chuẩn bị năng lực tiếng Trung đến hoàn thiện hồ sơ, CSCA Academy đồng hành cùng bạn.',
    badge: 'Top 100 Châu Á',
    icon: Award,
    bgImage: HOME_IMAGES.peking,
    accentColor: 'from-blue-500 to-indigo-600',
  },
  {
    title: 'Trường đại học danh tiếng Trung Quốc chờ đón bạn',
    subtitle: 'Môi trường học tập hiện đại, chất lượng quốc tế. Hàng trăm cơ hội học bổng từ các trường danh tiếng đang chờ bạn.',
    badge: 'Tương lai rộng mở',
    icon: School,
    bgImage: HOME_IMAGES.tsinghua,
    accentColor: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'Mùa hoa anh đào tại các đại học Trung Quốc',
    subtitle: 'Không chỉ là học tập, du học còn là trải nghiệm văn hoá và thiên nhiên tuyệt đẹp bốn mùa tại Trung Quốc.',
    badge: 'Trải nghiệm 4 mùa',
    icon: Sparkles,
    bgImage: HOME_IMAGES.wuhanSakura,
    accentColor: 'from-pink-400 to-rose-600',
  },
  {
    title: 'Vạn Lý Trường Thành — Biểu tượng của ý chí',
    subtitle: 'Giống như hành trình chinh phục HSK, mỗi bước đi đều đưa bạn tiến gần hơn đến ước mơ du học.',
    badge: '300+ hồ sơ thành công',
    icon: Plane,
    bgImage: HOME_IMAGES.greatWall,
    accentColor: 'from-violet-500 to-rose-500',
  },
];

// ─── Hero Banner (phong cách MoliStudio) ────────────────────────────────────────
const HeroBanner = () => {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);
  const transitionRef = useRef(null);
  const currentRef = useRef(0);

  const commitSlide = useCallback((index) => {
    const next = ((index % heroSlides.length) + heroSlides.length) % heroSlides.length;
    if (next === currentRef.current) return;
    setPrevious(currentRef.current);
    currentRef.current = next;
    setCurrent(next);
    if (transitionRef.current) clearTimeout(transitionRef.current);
    transitionRef.current = setTimeout(() => setPrevious(null), 800);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      commitSlide(currentRef.current + 1);
    }, 5500);
  }, [commitSlide]);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, [startTimer]);

  const go = (dir) => {
    if (timerRef.current) clearInterval(timerRef.current);
    commitSlide(currentRef.current + dir);
    startTimer();
  };

  const goTo = (index) => {
    if (timerRef.current) clearInterval(timerRef.current);
    commitSlide(index);
    startTimer();
  };

  const slide = heroSlides[current];
  const Icon = slide.icon;

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ height: 'calc(100svh - 68px)', minHeight: '520px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Ảnh nền slides */}
      {[previous, current]
        .filter((index, pos, arr) => index !== null && arr.indexOf(index) === pos)
        .map((index) => {
          const item = heroSlides[index];
          const isActive = index === current;
          return (
            <div
              key={`slide-${index}`}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? 'z-[1] opacity-100' : 'z-0 opacity-0'}`}
            >
              <img
                src={item.bgImage}
                alt=""
                className="h-full w-full object-cover"
                loading={index === 0 ? 'eager' : 'lazy'}
                onError={handleImageError}
              />
              {/* Overlay layers */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className={`absolute inset-0 bg-gradient-to-br ${item.accentColor} opacity-[0.08]`} />
            </div>
          );
        })}

      {/* Nội dung chính */}
      <div className="relative z-10 flex h-full items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            {/* Text bên trái */}
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-5 py-2 backdrop-blur-md">
                <Icon className="h-4 w-4 text-white" />
                <span className="text-sm font-semibold text-white">{slide.badge}</span>
              </div>

              <h1 className="mb-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
                {slide.title}
              </h1>

              <p className="mb-7 max-w-xl text-base font-light leading-relaxed text-white/80 sm:text-lg md:text-xl">
                {slide.subtitle}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-900 shadow-2xl transition-all hover:scale-105 hover:bg-gray-100 active:scale-95 sm:px-8 sm:py-4 sm:text-base"
                >
                  Bắt đầu học <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://zalo.me/0812352005"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:px-8 sm:py-4 sm:text-base"
                >
                  <MessageCircle className="h-4 w-4" /> Tư vấn qua Zalo
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Nút prev/next */}
      <button
        type="button"
        onClick={() => go(-1)}
        className={`absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/15 backdrop-blur-md transition-all hover:bg-white/30 sm:left-5 sm:h-12 sm:w-12 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        aria-label="Slide trước"
      >
        <ChevronLeft className="h-5 w-5 text-white" />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        className={`absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/15 backdrop-blur-md transition-all hover:bg-white/30 sm:right-5 sm:h-12 sm:w-12 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        aria-label="Slide tiếp theo"
      >
        <ChevronRight className="h-5 w-5 text-white" />
      </button>

      {/* Dots + số slide */}
      <div className="absolute bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 sm:gap-3">
        {heroSlides.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            className={`rounded-full transition-all duration-300 ${index === current ? 'h-2.5 w-8 bg-white' : 'h-2.5 w-2.5 bg-white/45 hover:bg-white/70'}`}
            aria-label={`Slide ${index + 1}`}
          />
        ))}
      </div>
      <div className="absolute bottom-12 right-8 z-20 hidden font-mono text-sm text-white/50 sm:block">
        {String(current + 1).padStart(2, '0')} / {String(heroSlides.length).padStart(2, '0')}
      </div>

      {/* Wave divider ở chân banner */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="block h-16 w-full">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" className="fill-white dark:fill-gray-950" />
        </svg>
      </div>
    </section>
  );
};

const StatsSection = () => {
  const stats = [
    { value: '5.000+', label: 'Học viên', icon: Users, suffix: '学生', color: 'from-blue-500 to-indigo-600', shadow: 'hover:shadow-blue-200/50 dark:hover:shadow-blue-900/30' },
    { value: '98%', label: 'Tỷ lệ đỗ HSK', icon: Award, suffix: '通过', color: 'from-emerald-500 to-teal-600', shadow: 'hover:shadow-emerald-200/50 dark:hover:shadow-emerald-900/30' },
    { value: '10+', label: 'Năm kinh nghiệm', icon: GraduationCap, suffix: '经验', color: 'from-amber-500 to-orange-600', shadow: 'hover:shadow-amber-200/50 dark:hover:shadow-amber-900/30' },
    { value: '300+', label: 'Hồ sơ du học thành công', icon: Plane, suffix: '成功', color: 'from-rose-500 to-pink-600', shadow: 'hover:shadow-rose-200/50 dark:hover:shadow-rose-900/30' },
  ];

  return (
  <section aria-label="Thành tựu nổi bật" className="relative z-10 mt-16 px-4 sm:px-6 lg:px-8 py-14 bg-gray-50/80 dark:bg-gray-900/50">
    <div className="mx-auto max-w-6xl">
      {/* Section heading */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <p className="text-red-600 dark:text-amber-400 text-sm font-bold uppercase tracking-[0.22em]">Thành tựu nổi bật</p>
        <h2 className="mt-2 text-2xl font-black text-gray-900 dark:text-white sm:text-3xl">Con số biết nói</h2>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {stats.map(({ value, label, icon: Icon, suffix, color, shadow }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.12 }}
            whileHover={{ y: -5, scale: 1.03 }}
            className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 sm:p-7 text-center cursor-default transition-all duration-300 shadow-md hover:shadow-xl ${shadow}`}
          >
            {/* Gradient accent bar top */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${color}`} />

            {/* Chinese character watermark */}
            <span className="absolute -bottom-2 -right-1 text-5xl font-black text-gray-100 dark:text-gray-700/50 select-none pointer-events-none transition-colors group-hover:text-gray-200 dark:group-hover:text-gray-600/50">{suffix}</span>

            <div className="relative">
              <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color} shadow-sm transition-transform duration-300 group-hover:scale-110`}>
                <Icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <strong className="block text-3xl font-black tracking-tight text-gray-900 dark:text-white sm:text-4xl">{value}</strong>
              <span className="mt-1 block text-xs font-semibold text-gray-500 dark:text-gray-400 sm:text-sm">{label}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
  );
};

const TrustSection = () => {
  const trustItems = [
    { label: 'Luyện thi HSK chính quy', icon: BookOpenCheck },
    { label: 'Giảng viên giàu kinh nghiệm', icon: GraduationCap },
    { label: 'Hỗ trợ học bổng', icon: Award },
    { label: 'Hỗ trợ hồ sơ du học', icon: Landmark },
    { label: 'Đồng hành từ A–Z', icon: Headphones },
  ];

  return (
  <section id="du-hoc" className="bg-white px-4 pb-20 pt-24 dark:bg-gray-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-red-600 dark:text-amber-400">Nền tảng đáng tin cậy</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-4xl">Một lộ trình, trọn vẹn sự đồng hành</h2>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-5">
        {trustItems.map(({ label, icon: Icon }) => (
          <div key={label} className="group rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center transition hover:-translate-y-1 hover:border-red-100 hover:bg-red-50 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:hover:border-red-900/50 dark:hover:bg-red-950/20">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm transition group-hover:scale-110 dark:bg-gray-800 dark:text-amber-400">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-bold leading-5 text-gray-800 dark:text-gray-200">{label}</h3>
          </div>
        ))}
      </div>
    </div>
  </section>
  );
};

const PartnerStrip = () => {
  const partners = [
    {
      name: 'Đại học Thanh Hoa',
      cn: '清华大学',
      image: HOME_IMAGES.tsinghua,
    },
    {
      name: 'Đại học Bắc Kinh',
      cn: '北京大学',
      image: HOME_IMAGES.peking,
    },
    {
      name: 'Đại học Nam Kinh',
      cn: '南京大学',
      image: HOME_IMAGES.nanjing,
    },
    {
      name: 'Đại học Đồng Tế',
      cn: '同济大学',
      image: HOME_IMAGES.tongji,
    },
    {
      name: 'Đại học Vũ Hán',
      cn: '武汉大学',
      image: HOME_IMAGES.wuhan,
    },
    {
      name: 'HSK · Chinese Test',
      cn: '汉语水平考试',
      image: HOME_IMAGES.chineseStudents,
    },
  ];

  // Duplicate list for seamless infinite scroll
  const scrollItems = [...partners, ...partners];

  return (
  <section aria-labelledby="partner-title" className="overflow-hidden border-y border-red-100 bg-[#fff9f4] py-12 dark:border-red-950/50 dark:bg-gray-900">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
      <p id="partner-title" className="text-center text-xs font-bold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Định hướng học tập và hồ sơ tới các trường đại học hàng đầu</p>
    </div>

    {/* Auto-scrolling marquee */}
    <div className="relative w-full overflow-hidden group">
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-24 z-10 bg-gradient-to-r from-[#fff9f4] to-transparent dark:from-gray-900" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-24 z-10 bg-gradient-to-l from-[#fff9f4] to-transparent dark:from-gray-900" />

      <motion.div
        className="flex gap-4 sm:gap-6 w-max"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ x: { duration: 25, repeat: Infinity, ease: 'linear' } }}
        style={{ willChange: 'transform' }}
      >
        {scrollItems.map(({ name, cn, image }, index) => (
          <div
            key={`${name}-${index}`}
            className="group/card relative flex-shrink-0 w-56 sm:w-64 rounded-2xl overflow-hidden border border-red-100 bg-white shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {/* University image */}
            <div className="relative h-36 sm:h-40 overflow-hidden">
              <img
                src={image}
                alt={name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                loading="lazy"
                onError={handleImageError}
              />
              {/* Dark overlay gradient at bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              {/* Chinese name on image */}
              <span className="absolute bottom-2 right-3 text-lg font-bold text-white/70">{cn}</span>
            </div>
            {/* Vietnamese name below */}
            <div className="px-4 py-3 text-center">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{name}</span>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
  );
};

const FeaturedCourses = () => {
  const featuredCourses = [
    {
      level: 'HSK 1-2',
      title: 'Xây nền tiếng Trung',
      description: 'Phát âm chuẩn, từ vựng cốt lõi và phản xạ giao tiếp dành cho người mới bắt đầu.',
      icon: Sparkles,
      color: 'from-red-500 to-rose-600',
    },
    {
      level: 'HSK 3-4',
      title: 'Bứt phá trung cấp',
      description: 'Phát triển đồng đều nghe, đọc, viết và chiến thuật làm bài theo từng dạng đề.',
      icon: BookOpenCheck,
      color: 'from-amber-400 to-orange-500',
    },
    {
      level: 'HSK 5-6',
      title: 'Chinh phục cao cấp',
      description: 'Nâng vốn từ, tư duy ngôn ngữ và năng lực xử lý đề chuyên sâu cho mục tiêu cao.',
      icon: Award,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      level: 'HSKK / CSCA',
      title: 'Sẵn sàng cho bước ngoặt',
      description: 'Luyện nói có phản hồi và chuẩn bị kiến thức cho kỳ thi đầu vào đại học Trung Quốc.',
      icon: GraduationCap,
      color: 'from-rose-500 to-amber-500',
    },
  ];

  return (
  <section id="khoa-hoc" className="bg-white px-4 py-24 dark:bg-gray-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-red-600 dark:text-amber-400">Khóa học nổi bật</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-5xl">Lộ trình phù hợp với từng mục tiêu</h2>
          <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">Bắt đầu từ nền tảng, bứt phá điểm số và chuẩn bị vững vàng cho hành trình học tập tại Trung Quốc.</p>
        </div>
        <Link to="/courses" className="inline-flex items-center gap-2 self-start rounded-xl font-bold text-red-600 transition hover:gap-3 dark:text-amber-400 md:self-auto">
          Xem tất cả khóa học <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {featuredCourses.map(({ level, title, description, icon: Icon, color }) => (
          <article key={level} className="group relative overflow-hidden rounded-[1.75rem] border border-gray-100 bg-gray-50 p-6 transition duration-300 hover:-translate-y-2 hover:bg-white hover:shadow-2xl hover:shadow-red-950/10 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${color}`} />
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white shadow-lg transition group-hover:scale-110`}>
              <Icon className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-red-600 dark:text-amber-400">{level}</p>
            <h3 className="mt-2 text-xl font-black text-gray-950 dark:text-white">{title}</h3>
            <p className="mt-3 min-h-[84px] text-sm leading-7 text-gray-600 dark:text-gray-400">{description}</p>
            <Link to="/courses" aria-label={`Tìm hiểu khóa ${level}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-gray-900 transition group-hover:text-red-600 dark:text-white dark:group-hover:text-amber-400">
              Tìm hiểu lộ trình <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>
    </div>
  </section>
  );
};

const campusGallery = [
  {
    src: HOME_IMAGES.tsinghua,
    title: 'Khuôn viên Đại học Thanh Hoa',
    tag: 'Tsinghua University',
    season: 'Thu',
  },
  {
    src: HOME_IMAGES.peking,
    title: 'Khuôn viên Đại học Bắc Kinh',
    tag: 'Peking University',
    season: 'Xuân',
  },
  {
    src: HOME_IMAGES.tongji,
    title: 'Thư viện Đại học Đồng Tế',
    tag: 'Tongji University',
    season: 'Đông',
  },
  {
    src: HOME_IMAGES.nanjing,
    title: 'Khuôn viên Đại học Nam Kinh',
    tag: 'Nanjing University',
    season: 'Thu',
  },
  {
    src: HOME_IMAGES.wuhanSakura,
    title: 'Hoa anh đào Đại học Vũ Hán',
    tag: 'Wuhan University',
    season: 'Xuân',
  },
  {
    src: HOME_IMAGES.chineseStudents,
    title: 'Sinh viên học tiếng Trung tại Bắc Kinh',
    tag: 'HSK · Tiếng Trung',
    season: 'Hè',
  },
  {
    src: HOME_IMAGES.greatWall,
    title: 'Tuyết phủ Vạn Lý Trường Thành',
    tag: 'Bắc Kinh',
    season: 'Đông',
  },
  {
    src: HOME_IMAGES.wuhan,
    title: 'Tòa nhà Đại học Vũ Hán',
    tag: 'Wuhan University',
    season: 'Quanh năm',
  },
];

const seasonColors = {
  'Xuân': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Hè': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Thu': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Đông': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Quanh năm': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const CampusGallery = () => (
  <section className="bg-gradient-to-b from-white via-red-50/30 to-white px-4 py-24 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-red-600 dark:text-amber-400">
          Trải nghiệm du học
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-4xl">
          Khám phá Trung Quốc qua bốn mùa
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-400">
          Từ những khuôn viên đại học danh tiếng đến cảnh sắc thiên nhiên tuyệt đẹp, hành trình du học của bạn sẽ là trải nghiệm không thể nào quên.
        </p>
      </div>

      {/* Gallery grid */}
      <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {campusGallery.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: index * 0.07 }}
            className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-red-950/10 dark:border-gray-800 dark:bg-gray-900 ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}
          >
            <div className={`overflow-hidden ${index === 0 ? 'aspect-square' : 'aspect-[4/3]'}`}>
              <img
                src={item.src}
                alt={item.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                onError={handleImageError}
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-80" />
            </div>

            {/* Season badge */}
            <div className="absolute right-3 top-3">
              <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${seasonColors[item.season] || seasonColors['Quanh năm']}`}>
                {item.season}
              </span>
            </div>

            {/* Info overlay */}
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <span className="mb-1 inline-block rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
                {item.tag}
              </span>
              <h3 className={`font-bold leading-tight text-white ${index === 0 ? 'text-lg sm:text-xl' : 'text-sm'}`}>
                {item.title}
              </h3>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Home = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white text-gray-950 dark:bg-gray-950 dark:text-white">
      <Meta title={t('homeMetaTitle')} description={t('homeMetaDescription')} keywords={t('homeMetaKeywords')} />
      <HeroBanner />
      <StatsSection />
      <TrustSection />
      <PartnerStrip />
      <FeaturedCourses />
      <CampusGallery />
      <Suspense fallback={<Loading loading text="Đang tải phản hồi..." />}>
        <div id="hoc-vien">
          <FeedBack />
        </div>
      </Suspense>
    </div>
  );
};

export default React.memo(Home);

export const SETTINGS_KEY = 'moly_pet_settings_v1';
export const HIDDEN_UNTIL_KEY = 'moly_pet_hidden_until_v1';
export const POSITION_KEY = 'moly_pet_position_v2';
export const SETTINGS_DEFAULTS_VERSION = 6;
export const PET_FRAME_SIZE = 72;
export const PET_PANEL_MAX_WIDTH = 372;
export const PET_PANEL_MARGIN = 12;

export const COLOR_THEMES = {
  ocean: {
    label: 'Biển xanh',
    body: 'from-sky-300 via-cyan-300 to-blue-500',
    accent: 'bg-cyan-200',
    button: 'bg-cyan-600 hover:bg-cyan-700',
    soft: 'bg-cyan-50 border-cyan-100 text-cyan-800',
    ring: 'ring-cyan-200/70',
  },
  berry: {
    label: 'Dâu hồng',
    body: 'from-rose-300 via-pink-300 to-fuchsia-500',
    accent: 'bg-rose-200',
    button: 'bg-rose-600 hover:bg-rose-700',
    soft: 'bg-rose-50 border-rose-100 text-rose-800',
    ring: 'ring-rose-200/70',
  },
  leaf: {
    label: 'Lá non',
    body: 'from-lime-300 via-emerald-300 to-teal-500',
    accent: 'bg-lime-200',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    soft: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    ring: 'ring-emerald-200/70',
  },
  sun: {
    label: 'Nắng cam',
    body: 'from-amber-200 via-orange-300 to-yellow-500',
    accent: 'bg-yellow-100',
    button: 'bg-amber-600 hover:bg-amber-700',
    soft: 'bg-amber-50 border-amber-100 text-amber-800',
    ring: 'ring-amber-200/70',
  },
};

export const PET_3D_PALETTES = {
  ocean: { body: 0x38d5f4, accent: 0x7dd3fc, innerEar: 0xf9a8d4, cheek: 0xfb7185 },
  berry: { body: 0xf472b6, accent: 0xf9a8d4, innerEar: 0xfda4af, cheek: 0xfb7185 },
  leaf: { body: 0x34d399, accent: 0xa3e635, innerEar: 0xf9a8d4, cheek: 0xfb7185 },
  sun: { body: 0xfbbf24, accent: 0xfdba74, innerEar: 0xfca5a5, cheek: 0xfb7185 },
};

export const PET_VARIANTS = {
  cat: {
    label: 'Mèo xanh',
    body: 0x38d5f4,
    accent: 0x7dd3fc,
    innerEar: 0xf9a8d4,
    cheek: 0xfb7185,
    swatch: 'from-cyan-200 via-sky-300 to-cyan-500',
  },
  star: {
    label: 'Công chúa sao',
    body: 0xf8fbff,
    accent: 0x9ed8ff,
    innerEar: 0xc7e7ff,
    cheek: 0xf9a8d4,
    swatch: 'from-white via-sky-200 to-blue-400',
  },
  bunny: {
    label: 'Thỏ tim',
    body: 0xfffbff,
    accent: 0xf9b8d5,
    innerEar: 0xfbd5e6,
    cheek: 0xf9a8d4,
    swatch: 'from-white via-pink-200 to-sky-200',
  },
  'moly-purple': {
    label: 'Moly tím',
    body: 0xad79ff,
    accent: 0xc4a1ff,
    innerEar: 0xffc4dc,
    cheek: 0xff8fb8,
    swatch: 'from-violet-300 via-purple-300 to-violet-600',
  },
  'moly-chibi': {
    label: 'Moly chibi',
    body: 0xffe6ea,
    accent: 0xff9fbd,
    innerEar: 0xffc4d6,
    cheek: 0xff8ba8,
    swatch: 'from-rose-100 via-pink-200 to-rose-400',
  },
  'moly-3d': {
    label: 'Mèo 3D',
    body: 0x8f70c4,
    accent: 0xf2a7c9,
    innerEar: 0xffc4d6,
    cheek: 0xff8ba8,
    swatch: 'from-violet-300 via-fuchsia-300 to-indigo-500',
    preview: '/models/moli-pet/previews/cat.png',
  },
  'moly-3d-hog': {
    label: 'Heo 3D',
    body: 0xb8734f,
    accent: 0xf5a07f,
    innerEar: 0xffb4a2,
    cheek: 0xff8ba8,
    swatch: 'from-orange-300 via-rose-300 to-amber-600',
    preview: '/models/moli-pet/previews/hog.png',
  },
  'moly-3d-penguin': {
    label: 'Cánh cụt 3D',
    body: 0x334155,
    accent: 0xf8fafc,
    innerEar: 0xfbbf24,
    cheek: 0xfb7185,
    swatch: 'from-slate-700 via-slate-300 to-orange-300',
    preview: '/models/moli-pet/previews/penguin.png',
  },
  'moly-3d-fox': {
    label: 'Cáo 3D',
    body: 0xf97316,
    accent: 0xfdba74,
    innerEar: 0xffedd5,
    cheek: 0xfb7185,
    swatch: 'from-orange-300 via-orange-500 to-amber-700',
    preview: '/models/moli-pet/previews/fox.png',
  },
  'moly-3d-crab': {
    label: 'Cua 3D',
    body: 0xf43f5e,
    accent: 0xfb7185,
    innerEar: 0xfda4af,
    cheek: 0xff8ba8,
    swatch: 'from-rose-300 via-red-500 to-orange-500',
    preview: '/models/moli-pet/previews/crab.png',
  },
  'moly-3d-panda': {
    label: 'Panda 3D',
    body: 0xf8fafc,
    accent: 0x1e293b,
    innerEar: 0x334155,
    cheek: 0xfb7185,
    swatch: 'from-white via-slate-300 to-slate-800',
    preview: '/models/moli-pet/previews/panda.png',
  },
};

export const MOODS = {
  friendly: { label: 'Thân thiện', hint: 'Chào hỏi nhẹ nhàng' },
  happy: { label: 'Vui vẻ', hint: 'Động viên nhiều hơn' },
  focus: { label: 'Tập trung', hint: 'Nhắc học gọn hơn' },
  sleepy: { label: 'Lười xíu', hint: 'Nói chậm, mềm hơn' },
};

export const PET_SKIN_IDS = [
  'bubble-cute',
  'floating-pet',
  'minimal-soft',
  'chibi-pet',
  'dark-cute',
  'retro-game',
  'glassmorphism',
];

export const PET_SKINS = {
  'bubble-cute': {
    id: 'bubble-cute',
    label: 'Bubble Pet Cute',
    badge: '1',
    subtitle: 'Hồng mềm, bong bóng tim',
    defaultColor: 'berry',
    defaultVariant: 'moly-3d-panda',
    panelClass: 'rounded-[24px] border border-rose-100 bg-rose-50/95 shadow-[0_24px_70px_rgba(244,114,182,0.28)] backdrop-blur-xl',
    headerClass: 'border-b border-rose-100 bg-gradient-to-r from-rose-50 via-white to-pink-50 text-slate-800',
    settingsClass: 'border-rose-100 bg-rose-50/85',
    assistantBubbleClass: 'bg-white text-slate-700 shadow-[0_10px_22px_rgba(244,114,182,0.13)] ring-1 ring-rose-100',
    userBubbleClass: 'bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-[0_10px_22px_rgba(244,114,182,0.24)]',
    inputClass: 'border-rose-100 bg-white text-slate-800 placeholder:text-rose-300 focus:border-rose-300',
    sendButtonClass: 'bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-[0_10px_22px_rgba(244,114,182,0.34)] hover:from-rose-500 hover:to-pink-600',
    triggerBadgeClass: 'bg-gradient-to-br from-rose-400 to-pink-500 text-white',
    triggerGlowClass: 'drop-shadow-[0_18px_28px_rgba(244,114,182,0.36)]',
    previewClass: 'bg-gradient-to-br from-rose-100 via-white to-pink-100 text-rose-600 ring-rose-100',
    actionClass: 'border-rose-100 bg-white text-rose-500 hover:bg-rose-50',
  },
  'floating-pet': {
    id: 'floating-pet',
    label: 'Floating Pet',
    badge: '2',
    subtitle: 'Tím nổi, pet ngoài khung',
    defaultColor: 'berry',
    defaultVariant: 'moly-3d-panda',
    panelClass: 'rounded-[28px] border border-violet-100 bg-white/94 shadow-[0_28px_80px_rgba(139,92,246,0.3)] backdrop-blur-xl',
    headerClass: 'border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 text-slate-800',
    settingsClass: 'border-violet-100 bg-violet-50/85',
    assistantBubbleClass: 'bg-white text-slate-700 shadow-[0_10px_24px_rgba(139,92,246,0.16)] ring-1 ring-violet-100',
    userBubbleClass: 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_10px_24px_rgba(139,92,246,0.28)]',
    inputClass: 'border-violet-100 bg-white text-slate-800 placeholder:text-violet-300 focus:border-violet-300',
    sendButtonClass: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_12px_24px_rgba(139,92,246,0.36)] hover:from-violet-600 hover:to-fuchsia-600',
    triggerBadgeClass: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
    triggerGlowClass: 'drop-shadow-[0_18px_32px_rgba(139,92,246,0.4)]',
    previewClass: 'bg-gradient-to-br from-violet-100 via-white to-fuchsia-100 text-violet-600 ring-violet-100',
    actionClass: 'border-violet-100 bg-white text-violet-500 hover:bg-violet-50',
  },
  'minimal-soft': {
    id: 'minimal-soft',
    label: 'Minimal Soft',
    badge: '3',
    subtitle: 'Trắng xanh gọn',
    defaultColor: 'ocean',
    defaultVariant: 'moly-3d',
    panelClass: 'rounded-[22px] border border-blue-100 bg-white/96 shadow-[0_18px_58px_rgba(37,99,235,0.18)] backdrop-blur-xl',
    headerClass: 'border-b border-blue-100 bg-gradient-to-r from-blue-50 via-white to-sky-50 text-slate-800',
    settingsClass: 'border-blue-100 bg-blue-50/80',
    assistantBubbleClass: 'bg-slate-50 text-slate-700 ring-1 ring-blue-100',
    userBubbleClass: 'bg-blue-500 text-white shadow-[0_10px_22px_rgba(37,99,235,0.24)]',
    inputClass: 'border-blue-100 bg-white text-slate-800 placeholder:text-blue-300 focus:border-blue-300',
    sendButtonClass: 'bg-blue-500 text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)] hover:bg-blue-600',
    triggerBadgeClass: 'bg-blue-500 text-white',
    triggerGlowClass: 'drop-shadow-[0_16px_26px_rgba(37,99,235,0.26)]',
    previewClass: 'bg-gradient-to-br from-blue-50 via-white to-sky-100 text-blue-600 ring-blue-100',
    actionClass: 'border-blue-100 bg-white text-blue-500 hover:bg-blue-50',
  },
};

export const SUGGESTED_ACTIONS = [
  'Moly nhắc học nhẹ nhàng',
  'Moly vẫy tay',
  'Moly ôm tim',
  'Moly giúp giải bài',
];

export const getDefaultSettings = (position = 'left') => ({
  name: 'Moly Pet',
  color: 'berry',
  mood: 'friendly',
  position,
  showBubble: false,
  motion: false,
  variant: 'moly-3d-panda',
  skin: 'bubble-cute',
});

export const readSettings = (position = 'left') => {
  if (typeof window === 'undefined') return getDefaultSettings(position);
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
    const defaults = getDefaultSettings(position);
    const savedName = typeof saved.name === 'string' ? saved.name.trim().slice(0, 24) : '';
    const hasCurrentDefaults = saved.defaultsVersion === SETTINGS_DEFAULTS_VERSION;
    return {
      ...defaults,
      ...saved,
      name: savedName && !['moli', 'conan'].includes(savedName.toLowerCase()) ? savedName : defaults.name,
      color: hasCurrentDefaults && COLOR_THEMES[saved.color] ? saved.color : defaults.color,
      mood: MOODS[saved.mood] ? saved.mood : defaults.mood,
      position: hasCurrentDefaults && (saved.position === 'right' || saved.position === 'left') ? saved.position : defaults.position,
      showBubble: typeof saved.showBubble === 'boolean' ? saved.showBubble : defaults.showBubble,
      motion: hasCurrentDefaults && typeof saved.motion === 'boolean' ? saved.motion : defaults.motion,
      variant: hasCurrentDefaults && PET_VARIANTS[saved.variant] ? saved.variant : defaults.variant,
      skin: hasCurrentDefaults && PET_SKINS[saved.skin] ? saved.skin : defaults.skin,
    };
  } catch {
    return getDefaultSettings(position);
  }
};

export const clampPetPoint = (point) => {
  if (typeof window === 'undefined') return point;
  const padding = 12;
  const maxX = Math.max(padding, window.innerWidth - PET_FRAME_SIZE - padding);
  const maxY = Math.max(84, window.innerHeight - PET_FRAME_SIZE - padding);
  return {
    x: Math.min(Math.max(padding, point.x), maxX),
    y: Math.min(Math.max(84, point.y), maxY),
  };
};

export const getInitialPetPoint = (position = 'left') => {
  if (typeof window === 'undefined') return { x: 20, y: 520 };
  const fallback = clampPetPoint({
    x: position === 'right' ? window.innerWidth - PET_FRAME_SIZE - 20 : 20,
    y: window.innerHeight - PET_FRAME_SIZE - 28,
  });

  try {
    const saved = JSON.parse(window.localStorage.getItem(POSITION_KEY) || '{}');
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      return clampPetPoint({ x: saved.x, y: saved.y });
    }
  } catch {
    // ignore
  }

  return fallback;
};

export const savePetPoint = (point) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(POSITION_KEY, JSON.stringify(clampPetPoint(point)));
};

export const getFirstName = (name) => {
  const trimmed = name?.trim();
  if (!trimmed) return 'bạn';
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1] || trimmed;
};

export const getRouteHint = (pathname) => {
  if (!pathname) return 'Mình ở đây để đồng hành và hỗ trợ bạn học tập.';
  if (pathname.includes('/quizzes') || pathname.includes('/quiz')) return 'Trước khi làm bài, nhớ đọc kỹ đề và công thức nhé.';
  if (pathname.includes('/assignments')) return 'Mình có thể giúp bạn giải thích hoặc gỡ rối bài tập.';
  if (pathname.includes('/courses') || pathname.includes('/classes')) return 'Hôm nay chúng mình học tiếp bài mới nhé.';
  if (pathname.includes('/calendar') || pathname.includes('/schedule')) return 'Theo dõi lịch học để không bỏ lỡ buổi học trực tuyến.';
  if (pathname.includes('/profile')) return 'Mục tiêu học tập của bạn đang tiến triển rất tốt!';
  return 'Mình là Moly Pet, luôn sẵn sàng giúp bạn giải bài!';
};

export const getStudyContext = (pathname) => {
  const path = pathname || '/';
  const normalized = path.toLowerCase();
  const subject = normalized.includes('vat-ly') || normalized.includes('physics')
    ? 'Vật lý'
    : normalized.includes('hoa')
      ? 'Hóa học'
      : normalized.includes('tieng-trung') || normalized.includes('chinese')
        ? 'Tiếng Trung'
        : normalized.includes('toan') || normalized.includes('math')
          ? 'Toán học'
          : normalized.includes('react') || normalized.includes('code')
            ? 'Lập trình'
            : '';
  const pageType = normalized.includes('quiz')
    ? 'bài kiểm tra'
    : normalized.includes('assignment')
      ? 'bài tập'
      : normalized.includes('learn') || normalized.includes('class')
        ? 'phòng học'
        : normalized.includes('calendar')
          ? 'lịch học'
          : 'không gian học tập';

  return { subject, pageType };
};

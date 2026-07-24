const createCourseCover = (title, chinese, colors) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${colors[0]}" />
          <stop offset="1" stop-color="${colors[1]}" />
        </linearGradient>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="white" stroke-opacity=".08" />
        </pattern>
      </defs>
      <rect width="1200" height="675" rx="36" fill="url(#bg)" />
      <rect width="1200" height="675" rx="36" fill="url(#grid)" />
      <circle cx="1030" cy="110" r="250" fill="white" fill-opacity=".08" />
      <circle cx="110" cy="650" r="270" fill="white" fill-opacity=".06" />
      <text x="80" y="110" fill="white" fill-opacity=".78" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="8">CSCA ACADEMY</text>
      <text x="80" y="340" fill="white" font-family="Arial, sans-serif" font-size="78" font-weight="800">${title}</text>
      <text x="82" y="430" fill="white" fill-opacity=".8" font-family="Arial, sans-serif" font-size="54">${chinese}</text>
      <rect x="80" y="515" width="230" height="58" rx="29" fill="white" fill-opacity=".16" stroke="white" stroke-opacity=".35" />
      <text x="195" y="553" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="700">HỌC TRỰC TUYẾN</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const demoCourses = [
  {
    _id: 'demo-hsk-1-2',
    isDemo: true,
    nameCourse: 'HSK 1–2 · Xây nền tiếng Trung',
    description: 'Phát âm, chữ Hán và giao tiếp cơ bản dành cho người mới bắt đầu.',
    level: 'Sơ cấp',
    lessonsCount: 36,
    duration: '12 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('HSK 1–2', '汉语入门', ['#ef4444', '#f59e0b']),
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
  },
  {
    _id: 'demo-hsk-3',
    isDemo: true,
    nameCourse: 'HSK 3 · Bứt phá trung cấp',
    description: 'Củng cố ngữ pháp, mở rộng từ vựng và luyện đủ bốn kỹ năng.',
    level: 'Trung cấp',
    lessonsCount: 42,
    duration: '14 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('HSK 3', '中级汉语', ['#0f766e', '#22c55e']),
    createdAt: '2026-01-12T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  },
  {
    _id: 'demo-hsk-4',
    isDemo: true,
    nameCourse: 'HSK 4 · Luyện đề chuyên sâu',
    description: 'Chiến thuật làm bài, phân tích dạng đề và nâng tốc độ xử lý.',
    level: 'Trung cấp',
    lessonsCount: 48,
    duration: '16 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('HSK 4', '考试强化', ['#2563eb', '#06b6d4']),
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
  },
  {
    _id: 'demo-hsk-5-6',
    isDemo: true,
    nameCourse: 'HSK 5–6 · Chinh phục cao cấp',
    description: 'Đọc hiểu nâng cao, viết học thuật và từ vựng theo chủ đề.',
    level: 'Cao cấp',
    lessonsCount: 56,
    duration: '20 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('HSK 5–6', '高级汉语', ['#7c3aed', '#db2777']),
    createdAt: '2026-01-18T00:00:00.000Z',
    updatedAt: '2026-06-27T00:00:00.000Z',
  },
  {
    _id: 'demo-hskk',
    isDemo: true,
    nameCourse: 'HSKK · Phản xạ khẩu ngữ',
    description: 'Luyện nghe nói, mô tả tranh và trả lời nhanh theo cấu trúc thi.',
    level: 'Mọi trình độ',
    lessonsCount: 30,
    duration: '10 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('HSKK', '口语考试', ['#ea580c', '#eab308']),
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
  },
  {
    _id: 'demo-csca',
    isDemo: true,
    nameCourse: 'CSCA · Dự bị đại học Trung Quốc',
    description: 'Kiến thức nền, kỹ năng học thuật và chuẩn bị kỳ thi đầu vào.',
    level: 'Dự bị đại học',
    lessonsCount: 40,
    duration: '16 tuần',
    authorName: 'CSCA Academy',
    imageCourse: createCourseCover('CSCA', '留学预科', ['#be123c', '#dc2626']),
    createdAt: '2026-01-22T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
  },
];

export default demoCourses;

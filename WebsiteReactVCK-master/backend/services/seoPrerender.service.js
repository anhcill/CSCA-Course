import fs from 'fs';
import path from 'path';

// Import article data from frontend data directory
let MOLY_ARTICLES = [];
try {
  const articlesModule = await import('../../frontend/src/data/molyArticles.js');
  MOLY_ARTICLES = articlesModule.default || [];
} catch (err) {
  console.warn('[SEO Prerender] Could not load molyArticles.js:', err.message);
}

const BASE_URL = 'https://www.molycourse.online';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const DEFAULT_TITLE = 'Moly Course — Hệ thống Khóa học & Luyện thi Trực tuyến';
const DEFAULT_DESCRIPTION = 'Moly Course — Nền tảng học tập & luyện thi trực tuyến chất lượng cao: chuyên sâu chuẩn đầu vào CSCA, tiếng Trung HSK, HSKK, hệ thống LMS làm bài tập & thi thử 24/7.';

export function getPageMetadata(reqPath) {
  const normalizedPath = reqPath.split('?')[0].replace(/\/+$/, '') || '/';

  // 1. Home
  if (normalizedPath === '/') {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      canonical: `${BASE_URL}/`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: false,
    };
  }

  // 2. Courses
  if (normalizedPath === '/courses') {
    return {
      title: 'Khóa Học Luyện Thi CSCA, Tiếng Trung HSK & HSKK Trực Tuyến | Moly Course',
      description: 'Khám phá hệ thống khóa học luyện thi CSCA chuẩn đầu vào, tiếng Trung HSK 1–6, luyện thi khẩu ngữ HSKK với ngân hàng đề thi thử LMS 24/7.',
      canonical: `${BASE_URL}/courses`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: false,
    };
  }

  // 3. Post list
  if (normalizedPath === '/post') {
    return {
      title: 'Bài Viết & Cẩm Nang Luyện Thi CSCA, Tiếng Trung HSK | Moly Course',
      description: 'Tổng hợp kinh nghiệm học tiếng Trung từ số 0, cẩm nang luyện thi HSK, HSKK, bí quyết thi CSCA và kinh nghiệm làm hồ sơ học bổng du học Trung Quốc.',
      canonical: `${BASE_URL}/post`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: false,
    };
  }

  // 4. Post detail: /post/:id
  if (normalizedPath.startsWith('/post/')) {
    const slug = normalizedPath.replace('/post/', '').trim();
    const article = MOLY_ARTICLES.find((a) => a.id === slug);
    if (article) {
      return {
        title: `${article.title} | Moly Course`,
        description: article.excerpt || DEFAULT_DESCRIPTION,
        canonical: `${BASE_URL}/post/${article.id}`,
        image: DEFAULT_IMAGE,
        type: 'article',
        noindex: false,
      };
    }
    return {
      title: 'Không tìm thấy bài viết | Moly Course',
      description: 'Bài viết không tồn tại hoặc đã được chuyển sang đường dẫn khác.',
      canonical: `${BASE_URL}${normalizedPath}`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: true,
    };
  }

  // 5. About
  if (normalizedPath === '/about') {
    return {
      title: 'Giới Thiệu Moly Course — Nền Tảng Luyện Thi CSCA & Tiếng Trung',
      description: 'Tìm hiểu về Moly Course: Sứ mệnh xây dựng lộ trình học tiếng Trung HSK, HSKK, luyện thi chuẩn đầu vào CSCA bài bản và chuẩn bị hồ sơ du học Trung Quốc.',
      canonical: `${BASE_URL}/about`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: false,
    };
  }

  // 6. Policy & Legal
  if (normalizedPath === '/policy-and-legal') {
    return {
      title: 'Chính Sách & Điều Khoản Sử Dụng | Moly Course',
      description: 'Quy định điều khoản sử dụng, chính sách bảo mật thông tin học viên, quyền sở hữu trí tuệ và thông tin liên hệ chính thức của Moly Course.',
      canonical: `${BASE_URL}/policy-and-legal`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: false,
    };
  }

  // 7. Private & Protected pages: explicitly tell bots not to index
  if (
    normalizedPath.startsWith('/admin') ||
    normalizedPath.startsWith('/lms') ||
    normalizedPath.startsWith('/profile') ||
    normalizedPath === '/unauthorized' ||
    normalizedPath === '/forbidden'
  ) {
    return {
      title: 'Không gian học tập trực tuyến | Moly Course',
      description: DEFAULT_DESCRIPTION,
      canonical: `${BASE_URL}${normalizedPath}`,
      image: DEFAULT_IMAGE,
      type: 'website',
      noindex: true,
    };
  }

  // Default fallback for any other route
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${BASE_URL}${normalizedPath}`,
    image: DEFAULT_IMAGE,
    type: 'website',
    noindex: false,
  };
}

let cachedIndexHtml = null;
let lastModifiedTime = 0;

export function renderHtmlWithSeo(htmlPath, reqPath) {
  try {
    const stats = fs.statSync(htmlPath);
    if (!cachedIndexHtml || stats.mtimeMs > lastModifiedTime) {
      cachedIndexHtml = fs.readFileSync(htmlPath, 'utf8');
      lastModifiedTime = stats.mtimeMs;
    }

    const meta = getPageMetadata(reqPath);
    let html = cachedIndexHtml;

    // Replace <title>
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}<\/title>`);
    html = html.replace(/<meta name="title" content="[\s\S]*?"\s*\/?>/i, `<meta name="title" content="${escapeHtml(meta.title)}" />`);

    // Replace meta description
    html = html.replace(/<meta name="description" content="[\s\S]*?"\s*\/?>/i, `<meta name="description" content="${escapeHtml(meta.description)}" />`);

    // Replace canonical URL
    html = html.replace(/<link rel="canonical" href="[\s\S]*?"\s*\/?>/i, `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);

    // Replace Open Graph tags
    html = html.replace(/<meta property="og:title" content="[\s\S]*?"\s*\/?>/i, `<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
    html = html.replace(/<meta property="og:description" content="[\s\S]*?"\s*\/?>/i, `<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
    html = html.replace(/<meta property="og:url" content="[\s\S]*?"\s*\/?>/i, `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
    html = html.replace(/<meta property="og:type" content="[\s\S]*?"\s*\/?>/i, `<meta property="og:type" content="${escapeHtml(meta.type)}" />`);

    // Replace Twitter tags
    html = html.replace(/<meta name="twitter:title" content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
    html = html.replace(/<meta name="twitter:description" content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
    html = html.replace(/<meta name="twitter:url" content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:url" content="${escapeHtml(meta.canonical)}" />`);

    // Replace robots if noindex
    if (meta.noindex) {
      html = html.replace(/<meta name="robots" content="[\s\S]*?"\s*\/?>/i, '<meta name="robots" content="noindex, nofollow" />');
      html = html.replace(/<meta name="googlebot" content="[\s\S]*?"\s*\/?>/i, '<meta name="googlebot" content="noindex, nofollow" />');
    }

    return html;
  } catch (err) {
    console.error('[SEO Prerender] Error rendering HTML:', err);
    return cachedIndexHtml || fs.readFileSync(htmlPath, 'utf8');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

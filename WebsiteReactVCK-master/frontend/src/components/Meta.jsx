import { Helmet } from 'react-helmet-async';

const DEFAULT_TITLE = 'Moly Course — Hệ thống Khóa học & Luyện thi Trực tuyến';
const DEFAULT_DESCRIPTION = 'Moly Course — Nền tảng học tập & luyện thi trực tuyến chất lượng cao: chuyên sâu chuẩn đầu vào CSCA, tiếng Trung HSK, HSKK, hệ thống LMS làm bài tập & thi thử 24/7.';
const DEFAULT_IMAGE = 'https://www.molycourse.online/og-image.png';
const BASE_URL = 'https://www.molycourse.online';

const Meta = ({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noindex = false,
  structuredData,
}) => {
  const pageTitle = title ? (title.includes('Moly Course') ? title : `${title} | Moly Course`) : DEFAULT_TITLE;
  
  // Determine canonical URL cleanly (strip tracking query params & hash to prevent duplicate content)
  const canonicalUrl = url || (typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : BASE_URL);

  const fullImageUrl = image.startsWith('http')
    ? image
    : `${BASE_URL}${image.startsWith('/') ? '' : '/'}${image}`;

  const robotsDirective = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  return (
    <Helmet>
      {/* Basic metadata */}
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={robotsDirective} />
      <meta name="googlebot" content={robotsDirective} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook / Zalo */}
      <meta property="og:site_name" content="Moly Course" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:image:alt" content={pageTitle} />
      <meta property="og:locale" content="vi_VN" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />

      {/* Structured Data (Schema.org) */}
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
    </Helmet>
  );
};

export default Meta;
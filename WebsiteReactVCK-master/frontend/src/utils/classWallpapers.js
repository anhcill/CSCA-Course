// Centralized CSCA Wallpapers & Class Cover Images Catalog
// Includes all 15 aesthetic oriental landscape and academy wallpapers
// Uploaded to Cloudinary with local WebP/JPG fallbacks

export const CSCA_WALLPAPERS = [
  {
    id: "spring-campus",
    title: "Thanh Sơn Thủy Đình",
    subtitle: "Khuôn viên xuân phong hoa đào",
    url: "/student-campus-spring.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579793/csca/wallpapers/student-campus-spring.webp",
  },
  {
    id: "morning-mist-campus",
    title: "Thần Vực Sương Mai",
    subtitle: "Khuôn viên học viện bình minh",
    url: "/wallpapers/morning-mist-campus.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579761/csca/wallpapers/morning-mist-campus.webp",
  },
  {
    id: "sunset-pavilion",
    title: "Tịch Dương Đình Các",
    subtitle: "Ánh hoàng hôn trên mái ngói đình",
    url: "/wallpapers/sunset-pavilion.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579794/csca/wallpapers/sunset-pavilion.webp",
  },
  {
    id: "autumn-terrace",
    title: "Thu Sắc Phong Kiều",
    subtitle: "Sắc phong lá đỏ & bậc thềm đá",
    url: "/wallpapers/autumn-terrace.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579783/csca/wallpapers/autumn-terrace.webp",
  },
  {
    id: "misty-mountains",
    title: "Vân Vụ Tiên Sơn",
    subtitle: "Dãy núi sương mờ & thung lũng xanh",
    url: "/wallpapers/misty-mountains.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579790/csca/wallpapers/misty-mountains.webp",
  },
  {
    id: "blossom-bridge",
    title: "Kiều Đầu Đào Hoa",
    subtitle: "Cầu đá uốn lượn rợp bóng đào",
    url: "/wallpapers/blossom-bridge.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579785/csca/wallpapers/blossom-bridge.webp",
  },
  {
    id: "bamboo-academy",
    title: "Trúc Lâm Thư Viện",
    subtitle: "Rừng trúc thanh tịnh & viện thư",
    url: "/wallpapers/bamboo-academy.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579784/csca/wallpapers/bamboo-academy.webp",
  },
  {
    id: "lotus-palace",
    title: "Liên Trì Lâu Các",
    subtitle: "Lâu các nguy nga soi bóng hồ sen",
    url: "/wallpapers/lotus-palace.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579789/csca/wallpapers/lotus-palace.webp",
  },
  {
    id: "golden-courtyard",
    title: "Kim Sắc Đình Viện",
    subtitle: "Sân viện cổ kính rực rỡ nắng vàng",
    url: "/wallpapers/golden-courtyard.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579787/csca/wallpapers/golden-courtyard.webp",
  },
  {
    id: "night-lanterns",
    title: "Dạ Nguyệt Hoa Đăng",
    subtitle: "Đèn hoa lung linh dưới trăng đêm",
    url: "/wallpapers/night-lanterns.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579792/csca/wallpapers/night-lanterns.webp",
  },
  {
    id: "scholar-study",
    title: "Hàn Nho Trai Phòng",
    subtitle: "Thư phòng học giả & ánh nến thanh",
    url: "/wallpapers/scholar-study.webp",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579793/csca/wallpapers/scholar-study.webp",
  },
  {
    id: "imperial-lake",
    title: "Cung Đình Hồ Sen",
    subtitle: "Lầu đình hoa đào & hồ sen cổ",
    url: "/wallpapers/imperial-lake.jpg",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579788/csca/wallpapers/imperial-lake.jpg",
  },
  {
    id: "ink-scroll",
    title: "Thư Họa Mặc Thủy",
    subtitle: "Cuộn thư, bút lông & sơn thủy",
    url: "/wallpapers/ink-scroll.jpg",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579789/csca/wallpapers/ink-scroll.jpg",
  },
  {
    id: "antique-map",
    title: "Bản Đồ Cổ & La Bàn",
    subtitle: "Hải trình khám phá tri thức",
    url: "/wallpapers/antique-map.jpg",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579782/csca/wallpapers/antique-map.jpg",
  },
  {
    id: "calligraphy-seal",
    title: "Thư Pháp & Chu Sa",
    subtitle: "Nét mặc phong vân & nghiên mực",
    url: "/wallpapers/calligraphy-seal.jpg",
    cloudinaryUrl: "https://res.cloudinary.com/dvrgrmais/image/upload/v1792579786/csca/wallpapers/calligraphy-seal.jpg",
  },
];

/**
 * Returns the class or course cover image.
 * If admin has configured an image (cover_image_url), use that.
 * Otherwise, deterministically selects a beautiful aesthetic wallpaper
 * based on the class/course ID so every class has a unique, non-flickering image.
 */
export function getClassCoverImage(classOrCourse, fallbackKey) {
  const explicit =
    classOrCourse?.cover_image_url ||
    classOrCourse?.coverImageUrl ||
    classOrCourse?.thumbnail_url ||
    classOrCourse?.thumbnailUrl ||
    classOrCourse?.image_url;

  // If explicit image is a real custom upload and not the default remote cloudinary fallback
  if (explicit && typeof explicit === "string" && explicit.trim() && !explicit.includes("cloudinary.com/dvrgrmais")) {
    return explicit.trim();
  }

  const key = String(
    classOrCourse?.id ||
    classOrCourse?.class_id ||
    classOrCourse?.course_id ||
    classOrCourse?.title ||
    classOrCourse?.name ||
    fallbackKey ||
    "csca"
  );

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CSCA_WALLPAPERS.length;
  // Use local webp first for lightning-fast 0ms load without external network dependency
  return CSCA_WALLPAPERS[index].url || CSCA_WALLPAPERS[index].cloudinaryUrl;
}

/**
 * Return a random wallpaper from the catalog
 */
export function getRandomWallpaper() {
  const randomIndex = Math.floor(Math.random() * CSCA_WALLPAPERS.length);
  return CSCA_WALLPAPERS[randomIndex];
}

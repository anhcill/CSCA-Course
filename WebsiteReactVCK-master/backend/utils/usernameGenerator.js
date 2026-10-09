import crypto from "crypto";

export const slugifyUsername = (text) => {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Bỏ dấu tiếng Việt
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 24);
};

export const createManagedUsername = async (client, prefix, externalId, options = {}) => {
  const { email, fullName } = options;

  // 1. Ưu tiên lấy từ tiền tố email (ví dụ: khlyp25@gmail.com -> khlyp25)
  let base = "";
  if (email && email.includes("@")) {
    const emailPrefix = slugifyUsername(email.split("@")[0]);
    if (emailPrefix.length >= 3) {
      base = emailPrefix.slice(0, 20);
    }
  }

  // 2. Nếu không có email, lấy từ fullName (ví dụ: ANHCILL -> anhcill)
  if (!base && fullName) {
    const nameSlug = slugifyUsername(fullName);
    if (nameSlug.length >= 3) {
      base = nameSlug.slice(0, 20);
    }
  }

  // 3. Fallback nếu không có gì: dùng prefix + 6 ký tự ngắn (ví dụ: student-120b85)
  if (!base) {
    const compact =
      String(externalId || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6) ||
      crypto.randomBytes(3).toString("hex");
    base = `${prefix}-${compact}`;
  }

  // Đảm bảo không trùng lặp trong cơ sở dữ liệu
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 24)}-${attempt + 1}`;
    const result = await client.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!result.rows[0]) return candidate;
  }

  // Fallback ngẫu nhiên ngắn gọn (tổng độ dài luôn <= 18 ký tự)
  const rand = crypto.randomBytes(2).toString("hex");
  return `${base.slice(0, 18)}-${rand}`;
};

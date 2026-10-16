const GOOGLE_DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

export const normalizeGoogleDriveUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !GOOGLE_DRIVE_HOSTS.has(hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

export const isGoogleDriveUrl = (value) => Boolean(normalizeGoogleDriveUrl(value));

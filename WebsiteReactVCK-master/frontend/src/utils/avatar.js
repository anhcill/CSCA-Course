export const DEFAULT_AVATAR_URL = "/avatar/avt_1.webp";
export const AVATAR_COUNT = 126;

export const getAvatarUrl = (userOrUrl) => {
  const value = typeof userOrUrl === "string"
    ? userOrUrl
    : userOrUrl?.avatarUrl || userOrUrl?.avatar_url;
  return value || DEFAULT_AVATAR_URL;
};

export const handleAvatarError = (event) => {
  if (event.currentTarget.src.endsWith(DEFAULT_AVATAR_URL)) return;
  event.currentTarget.src = DEFAULT_AVATAR_URL;
};

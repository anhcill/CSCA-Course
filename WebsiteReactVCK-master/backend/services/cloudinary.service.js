import crypto from "crypto";

const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error("Cloudinary chưa được cấu hình đầy đủ");
    error.code = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }
  return { cloudName, apiKey, apiSecret };
};

const encodeSignatureParams = (params) => Object.entries(params)
  .filter(([, value]) => value !== undefined && value !== null && value !== "")
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
  .join("&");

export const createCloudinaryUploadSignature = ({ folder = "csca/lms", resourceType = "auto" } = {}) => {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, timestamp };
  const signature = crypto.createHash("sha1")
    .update(`${encodeSignatureParams(params)}${apiSecret}`)
    .digest("hex");
  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    resourceType,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
  };
};

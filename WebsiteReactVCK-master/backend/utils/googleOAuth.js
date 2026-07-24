import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

const OAUTH_COOKIE_NAME = "google_oauth_flow";
const OAUTH_COOKIE_PATH = "/api/auth/google";
const OAUTH_COOKIE_MAX_AGE = 10 * 60 * 1000;

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getConfig = () => ({
  clientId: requiredEnv("GOOGLE_CLIENT_ID"),
  clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
  redirectUri: requiredEnv("GOOGLE_REDIRECT_URI"),
  stateSecret: requiredEnv("GOOGLE_OAUTH_STATE_SECRET"),
});

const getOAuthClient = () => {
  const { clientId, clientSecret, redirectUri } = getConfig();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
};

const randomValue = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

const signPayload = (payload, secret) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
};

const verifySignedPayload = (value, secret) => {
  if (!value || typeof value !== "string") return null;

  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const oauthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: OAUTH_COOKIE_PATH,
  maxAge: OAUTH_COOKIE_MAX_AGE,
});

export const createGoogleAuthorization = () => {
  const { stateSecret } = getConfig();
  const client = getOAuthClient();
  const state = randomValue();
  const nonce = randomValue();
  const codeVerifier = randomValue(64);
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const createdAt = Date.now();

  const cookieValue = signPayload({ state, nonce, codeVerifier, createdAt }, stateSecret);
  const authorizationUrl = client.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    nonce,
  });

  return { authorizationUrl, cookieValue, cookieOptions: oauthCookieOptions() };
};

export const clearGoogleOAuthCookie = (res) => {
  const { maxAge, ...options } = oauthCookieOptions();
  res.clearCookie(OAUTH_COOKIE_NAME, options);
};

export const getGoogleOAuthCookieName = () => OAUTH_COOKIE_NAME;

export const consumeGoogleCallback = async ({ code, state, cookieValue }) => {
  const { clientId, stateSecret } = getConfig();
  const flow = verifySignedPayload(cookieValue, stateSecret);

  if (!flow || !flow.state || !flow.nonce || !flow.codeVerifier || !flow.createdAt) {
    throw new Error("OAUTH_STATE_INVALID");
  }

  if (Date.now() - flow.createdAt > OAUTH_COOKIE_MAX_AGE) {
    throw new Error("OAUTH_STATE_EXPIRED");
  }

  const expectedState = Buffer.from(flow.state);
  const receivedState = Buffer.from(typeof state === "string" ? state : "");
  if (
    expectedState.length !== receivedState.length ||
    !crypto.timingSafeEqual(expectedState, receivedState)
  ) {
    throw new Error("OAUTH_STATE_INVALID");
  }

  if (!code || typeof code !== "string") {
    throw new Error("OAUTH_CODE_MISSING");
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken({ code, codeVerifier: flow.codeVerifier });
  if (!tokens.id_token) {
    throw new Error("OAUTH_ID_TOKEN_MISSING");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });
  const payload = ticket.getPayload();

  if (!payload || payload.nonce !== flow.nonce) {
    throw new Error("OAUTH_NONCE_INVALID");
  }

  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error("OAUTH_EMAIL_UNVERIFIED");
  }

  return {
    googleId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name || "",
    picture: payload.picture || null,
  };
};

import jwt from 'jsonwebtoken';

const DEFAULT_JWT_EXPIRES_IN = '15d';

const parseDurationMs = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
    const match = String(value || '').trim().match(/^(\d+)\s*([smhd])$/i);
    if (!match) return 15 * 24 * 60 * 60 * 1000;
    const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return Number(match[1]) * multipliers[match[2].toLowerCase()];
};

export const getJwtExpiresIn = () => {
    const configured = process.env.JWT_EXPIRES_IN;
    if (typeof configured === 'string' && /^\d+\s*[smhd]$/i.test(configured.trim())) {
        return configured.trim();
    }
    return DEFAULT_JWT_EXPIRES_IN;
};

export const getJwtExpirationDate = () => new Date(Date.now() + parseDurationMs(getJwtExpiresIn()));

export const jwtCookieOptions = () => ({
    maxAge: parseDurationMs(getJwtExpiresIn()),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV !== 'development',
    path: "/"
});

const generateTokenAndSetCookie = (user, res, session) => {
    try {
        if (!session?.sessionId || !session?.sessionToken) {
            throw new Error('A persisted login session is required before issuing a JWT');
        }

        const token = jwt.sign({
            userId: user.id,
            role: user.role,
            sessionId: session.sessionId,
            sessionToken: session.sessionToken,
        }, process.env.JWT_SECRET, {
            expiresIn: getJwtExpiresIn()
        });

        res.cookie("jwt", token, jwtCookieOptions());

        return token;
        
    } catch (error) {
        console.error('Error generating token:', error);
        throw error;
    }
};

export default generateTokenAndSetCookie;

import jwt from 'jsonwebtoken';

export const jwtCookieOptions = () => ({
    maxAge: 15 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV !== 'development',
    path: "/"
});

const generateTokenAndSetCookie = (user, res) => { // Nhận đối tượng user thay vì userId
    try {
        // Tạo token JWT, payload bây giờ bao gồm userId và role
        const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '15d'
        });

        res.cookie("jwt", token, jwtCookieOptions());

        return token;
        
    } catch (error) {
        console.error('Error generating token:', error);
        // Xử lý lỗi
    }
};

export default generateTokenAndSetCookie;
import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { normalizeUserDto, useAuthContext } from '../context/AuthContext';

const useLogin = () => {
    const [loading, setLoading] = useState(false);
    const { setAuthUser, setIsAuthenticated } = useAuthContext();

    const login = async ({ email, password }) => {
        const { success, error } = handleInputErrors({ email, password });

        if (!success) {
            throw new Error(error);
        }

        setLoading(true);
        try {
            const res = await axios.post('/api/auth/login', { email, password }, {
                headers: { 'Content-Type': 'application/json' },
            });

            // PostgreSQL backend response shape:
            // { success: true, message: userObject, token: "..." }
            // userObject has: id, avatar_url, is_vip, vip_expires_at,
            //                 email_verified, created_at, updated_at, …
            const data = res.data;

            if (!data.success) {
                const errorMsg = data.message || 'Đăng nhập thất bại';
                toast.error(errorMsg);
                throw new Error(errorMsg);
            }

            const user = normalizeUserDto(data.message);
            setAuthUser(user);
            setIsAuthenticated(true);
            return user;
        } catch (error) {
            // axios wraps HTTP errors in error.response; re-surface the message
            const serverMessage = error.response?.data?.message;
            if (serverMessage) {
                toast.error(serverMessage);
                throw new Error(serverMessage);
            }
            // Non-HTTP errors (network down, already-toasted validation errors)
            throw error;
        } finally {
            setLoading(false);
        }
    };

    function handleInputErrors({ email, password }) {
        if (!email || !password) {
            toast.error('Vui lòng nhập đầy đủ thông tin');
            return { success: false, error: 'Vui lòng nhập đầy đủ thông tin' };
        }

        if (email.trim().length < 3) {
            toast.error('Email hoặc tên đăng nhập không hợp lệ');
            return { success: false, error: 'Email hoặc tên đăng nhập không hợp lệ' };
        }

        if (password.length < 6) {
            toast.error('Mật khẩu phải có ít nhất 6 ký tự');
            return { success: false, error: 'Mật khẩu phải có ít nhất 6 ký tự' };
        }

        return { success: true, error: null };
    }

    return { loading, login };
};

export default useLogin;

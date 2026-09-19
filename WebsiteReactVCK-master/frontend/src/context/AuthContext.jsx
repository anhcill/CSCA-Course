/* eslint-disable react/prop-types */
import axios from 'axios';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { useTranslation } from 'react-i18next';

export const normalizeUserDto = (user) => {
    if (!user) return null;
    return {
        ...user,
        id: user.id ?? user._id,
        avatarUrl: user.avatarUrl ?? user.avatar_url ?? null,
        isVip: user.isVip ?? user.is_vip ?? false,
        vipExpiresAt: user.vipExpiresAt ?? user.vip_expires_at ?? null,
        emailVerified: user.emailVerified ?? user.email_verified ?? false,
        authProvider: user.authProvider ?? user.oauth_provider ?? 'local',
        hasPassword: user.hasPassword ?? Boolean(user.password_hash),
        isManagementManaged: user.isManagementManaged ?? user.is_management_managed ?? false,
        lmsAccountStatus: user.lmsAccountStatus ?? user.lms_account_status ?? 'unmanaged',
        createdAt: user.createdAt ?? user.created_at ?? null,
        updatedAt: user.updatedAt ?? user.updated_at ?? null,
        studentProfile: user.studentProfile ?? null,
    };
};

// Create context for auth management
export const AuthContext = createContext();

export const useAuthContext = () => {
    return useContext(AuthContext);
};

// Named alias so consumers can import either name
export const useAuth = useAuthContext;

export const AuthContextProvider = ({ children }) => {
    const { t } = useTranslation();

    // Initialise from localStorage so state survives a page refresh
    const [authUser, setAuthUserState] = useState(() => {
        try {
            const stored = localStorage.getItem('auth-user');
            return stored ? normalizeUserDto(JSON.parse(stored)) : null;
        } catch {
            return null;
        }
    });

    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        try {
            return !!localStorage.getItem('auth-user');
        } catch {
            return false;
        }
    });
    const [sessionExpired, setSessionExpired] = useState(false);

    const isMounted = React.useRef(true);
    const oauthResultHandled = React.useRef(false);
    const activeSessionRef = React.useRef(Boolean(authUser));

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        activeSessionRef.current = Boolean(authUser) || isAuthenticated;
    }, [authUser, isAuthenticated]);

    // Keep localStorage in sync whenever authUser changes
    const setAuthUser = useCallback((user) => {
        const normalizedUser = normalizeUserDto(user);
        setAuthUserState(normalizedUser);
        if (normalizedUser) {
            try {
                localStorage.setItem('auth-user', JSON.stringify(normalizedUser));
            } catch {
                // localStorage unavailable – ignore
            }
        } else {
            localStorage.removeItem('auth-user');
        }
    }, []);

    const handleSessionExpired = useCallback(() => {
        if (!activeSessionRef.current) return;

        activeSessionRef.current = false;
        setIsAuthenticated(false);
        setAuthUser(null);
        setSessionExpired(true);
    }, [setAuthUser]);

    const dismissSessionExpired = useCallback(() => {
        setSessionExpired(false);
    }, []);

    // A session can expire while an LMS request is in flight. Keep the
    // response policy in one place so both Axios and fetch-based LMS clients
    // show the same recovery UI.
    useEffect(() => {
        const axiosInterceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                const url = String(error.config?.url || '');
                if (error.response?.status === 401 && !url.includes('/api/auth/')) {
                    handleSessionExpired();
                }
                return Promise.reject(error);
            },
        );

        const handleFetchSessionExpired = () => handleSessionExpired();
        window.addEventListener('csca:session-expired', handleFetchSessionExpired);

        return () => {
            axios.interceptors.response.eject(axiosInterceptor);
            window.removeEventListener('csca:session-expired', handleFetchSessionExpired);
        };
    }, [handleSessionExpired]);

    // useCallback (not useMemo) — it IS a function, not a derived value
    const fetchCurrentUser = useCallback(async (abortController) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/auth/me', {
                signal: abortController?.signal,
            });

            if (!isMounted.current) return;

            const data = res.data;

            // PostgreSQL backend returns { success: true, message: userObject }
            // userObject fields: id, avatar_url, is_vip, vip_expires_at,
            //                    email_verified, created_at, updated_at, …
            if (res.status === 200 && data.success) {
                setAuthUser(data.message);
                setIsAuthenticated(true);
                return true;
            }

            setIsAuthenticated(false);
            setAuthUser(null);
            return false;
        } catch (error) {
            if (!isMounted.current) return;

            // AbortError is expected on component unmount — don't clear the user
            if (axios.isCancel(error) || error.name === 'CanceledError') return;

            if (error.response?.status !== 401) {
                console.error('AuthContext fetchCurrentUser error:', error.message);
            }
            setIsAuthenticated(false);
            setAuthUser(null);
            return false;
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [setAuthUser]);

    // Fetch the authenticated user on mount and finish an OAuth redirect if present
    useEffect(() => {
        const abortController = new AbortController();
        let timeoutId;

        const initFetch = async () => {
            const params = new URLSearchParams(window.location.search);
            const authResult = params.get('auth');
            const reason = params.get('reason');

            const authenticated = await fetchCurrentUser(abortController);

            if (!authResult || oauthResultHandled.current || !isMounted.current) return;
            oauthResultHandled.current = true;

            if (authResult === 'google-success' && authenticated) {
                toast.success('Đăng nhập Google thành công!');
            } else if (authResult === 'google-success') {
                toast.error('Không thể xác nhận phiên đăng nhập Google. Vui lòng thử lại.');
            } else if (authResult === 'google-error') {
                const messages = {
                    cancelled: 'Bạn đã hủy đăng nhập Google.',
                    state_invalid: 'Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.',
                    email_unverified: 'Email Google chưa được xác minh.',
                    account_conflict: 'Không thể liên kết tài khoản Google với email này.',
                    account_locked: 'Tài khoản LMS chưa được kích hoạt hoặc đã bị tạm ngưng. Vui lòng liên hệ quản lý học viên.',
                    oauth_failed: 'Đăng nhập Google thất bại. Vui lòng thử lại.',
                };
                toast.error(messages[reason] || messages.oauth_failed);
            }

            params.delete('auth');
            params.delete('reason');
            const query = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
        };

        timeoutId = setTimeout(initFetch, 100);

        return () => {
            clearTimeout(timeoutId);
            abortController.abort();
        };
    }, [fetchCurrentUser]);

    // ─── Auth actions ──────────────────────────────────────────────────────────

    const initiateSignup = useCallback(async (userData) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/auth/signup', userData, {
                headers: { 'Content-Type': 'application/json' },
            });

            const data = response.data;

            if (data.success) {
                toast.success(t('verificationCodeSent'));
                return true;
            } else {
                const errorMessage = data.message || t('codeSendError');
                toast.error(errorMessage);
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Signup initiation error:', error);
            // Avoid double-toasting when we already called toast.error above
            if (!error.response) {
                toast.error(t('codeSendError'));
            } else {
                const msg = error.response?.data?.message || t('codeSendError');
                toast.error(msg);
            }
            throw error;
        } finally {
            setLoading(false);
        }
    }, [t]);

    const completeSignup = useCallback(async (email, verificationCode) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/auth/complete-signup', {
                email,
                verificationCode,
            }, {
                headers: { 'Content-Type': 'application/json' },
            });

            const data = response.data;

            if (data.success) {
                toast.success(t('registerSuccess'));
                return true;
            } else {
                let errorMessage = t('verificationError');
                if (data.message === 'No pending registration found') {
                    errorMessage = t('noPendingRegistration');
                } else if (data.message === 'Invalid verification code') {
                    errorMessage = t('invalidVerificationCode');
                }
                toast.error(errorMessage);
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Signup completion error:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [t]);

    const requestPasswordReset = useCallback(async (email) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/auth/request-password-reset', { email }, {
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.data.success) {
                throw new Error(response.data.message || t('resetError'));
            }

            toast.success(response.data.message || t('resetLinkSent'));
            return response.data;
        } catch (error) {
            console.error('Password reset request error:', error.response?.data || error.message);
            toast.error(error.response?.data?.message || t('resetError'));
            throw error;
        } finally {
            setLoading(false);
        }
    }, [t]);

    const resetPassword = useCallback(async (email, resetCode, newPassword) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/auth/reset-password', {
                email,
                resetCode,
                newPassword,
            });

            if (!response.data.success) {
                throw new Error(response.data.message || t('resetError'));
            }

            toast.success(t('passwordResetSuccess'));
            return response.data;
        } catch (error) {
            console.error('Reset password error:', error);
            toast.error(error.response?.data?.message || error.message || t('resetError'));
            throw error;
        } finally {
            setLoading(false);
        }
    }, [t]);

    // ─── Context value ─────────────────────────────────────────────────────────

    const contextValue = useMemo(() => ({
        authUser,
        setAuthUser,
        isAuthenticated,
        setIsAuthenticated,
        loading,
        fetchCurrentUser,
        initiateSignup,
        completeSignup,
        requestPasswordReset,
        resetPassword,
        sessionExpired,
        dismissSessionExpired,
    }), [
        authUser,
        setAuthUser,
        isAuthenticated,
        loading,
        fetchCurrentUser,
        initiateSignup,
        completeSignup,
        requestPasswordReset,
        resetPassword,
        sessionExpired,
        dismissSessionExpired,
    ]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

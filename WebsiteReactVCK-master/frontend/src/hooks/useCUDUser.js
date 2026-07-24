import { useState } from 'react';
import axios from 'axios';
import { useAuthContext } from '../context/AuthContext';

const useCUDUser = () => {
    const { authUser, isAuthenticated, setAuthUser } = useAuthContext();
    const [saving, setSaving] = useState(false);

    const checkAdminAuth = () => {
        if (!isAuthenticated || authUser?.role !== 'admin') {
            throw new Error('Unauthorized - Admin access required');
        }
    };

    const request = async (callback) => {
        setSaving(true);
        try {
            return await callback();
        } catch (error) {
            throw new Error(error.response?.data?.message || 'Cập nhật thất bại');
        } finally {
            setSaving(false);
        }
    };

    const createUser = (data) => request(async () => {
        checkAdminAuth();
        const response = await axios.post('/api/auth/admin/users', data);
        return response.data.message;
    });

    const updateUser = (id, data) => request(async () => {
        checkAdminAuth();
        const response = await axios.put(`/api/auth/admin/users/${id}`, data);
        return response.data.message;
    });

    const deleteUser = (id) => request(async () => {
        checkAdminAuth();
        const response = await axios.delete(`/api/auth/admin/users/${id}`);
        return response.data.message;
    });

    const updateUserInfo = (data) => request(async () => {
        const response = await axios.patch('/api/auth/me', data);
        setAuthUser(response.data.message);
        return response.data.message;
    });

    const updateStudentProfile = (data) => request(async () => {
        const response = await axios.patch('/api/auth/me/student-profile', data);
        setAuthUser(response.data.message);
        return response.data.message;
    });

    return {
        createUser,
        updateUser,
        deleteUser,
        updateUserInfo,
        updateStudentProfile,
        saving,
    };
};

export default useCUDUser;

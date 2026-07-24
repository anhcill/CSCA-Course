// hooks/useGetUsers.js
import { useState, useEffect } from 'react';
import axios from 'axios';

const useGetUsers = () => {
    const [users, setUsers] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get('/api/auth/'); // JWT được gửi bằng cookie HttpOnly
            setUsers(response.data.data); // Giả định API trả về { success: true, data: users }
        } catch (err) {
            setError(err.message || 'Failed to fetch users');
            setUsers(null); // Reset users state on error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Hàm refetch để gọi lại fetchUsers khi cần
    const refetchUsers = () => {
        fetchUsers();
    };

    return { users, loading, error, refetchUsers, setUsers }; // Thêm refetchUsers và setUsers vào giá trị trả về
};

export default useGetUsers;
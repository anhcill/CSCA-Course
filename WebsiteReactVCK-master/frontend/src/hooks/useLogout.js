import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";

const useLogout = () => {
    const [loading, setLoading] = useState(false);
    const { setAuthUser, setIsAuthenticated, dismissSessionExpired } = useAuthContext();

    const logout = async () => {
        setLoading(true);
        try {
            const res = await axios.post("/api/auth/logout", {}, {
                headers: { "Content-Type": "application/json" },
            });

            const data = res.data;

            if (data.error) {
                throw new Error(data.error);
            }

            // Clear persisted session data
            localStorage.removeItem("auth-user");
            localStorage.removeItem("user-course");
            localStorage.removeItem("chat-history");

            // Reset auth state — navigation is handled by the calling component
            setAuthUser(null);
            setIsAuthenticated(false);
            dismissSessionExpired?.();
        } catch (error) {
            const serverMessage = error.response?.data?.message || error.response?.data?.error;
            toast.error(serverMessage || error.message || "Logout failed");
        } finally {
            setLoading(false);
        }
    };

    return { loading, logout };
};

export default useLogout;

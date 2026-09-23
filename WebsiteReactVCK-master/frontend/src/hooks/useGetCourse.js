import { useEffect } from "react";
import { useState } from "react";
import axios from "axios";
import demoCourses from "../data/demoCourses";

const useGetCourse = ({ demoFallback = false } = {}) => {
    const [courses, setCourses] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const response = await axios.get('/api/courses');
                const apiCourses = Array.isArray(response.data?.data) ? response.data.data : [];
                if (apiCourses.length > 0 || !demoFallback) {
                    setCourses(apiCourses);
                    setIsDemo(false);
                } else {
                    setCourses(demoCourses);
                    setIsDemo(true);
                }
            } catch (error) {
                if (demoFallback) {
                    setCourses(demoCourses);
                    setIsDemo(true);
                    setError(null);
                } else {
                    setError(error.message);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchCourses();
    }, [demoFallback]);
    return {courses, error, loading, isDemo};
};

export default useGetCourse;

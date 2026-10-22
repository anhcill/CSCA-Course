/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';


const ThemeContext = createContext();

const getInitialTheme = () => {
    const storedTheme = localStorage.getItem('darkMode');
    if (storedTheme !== null) return storedTheme === 'true';
    return false; // Mặc định là giao diện sáng cho toàn hệ thống
};

export const ThemeProvider = ({ children }) => {
    const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);

    useEffect(() => {
        localStorage.setItem('darkMode', isDarkMode);
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode((currentTheme) => !currentTheme);

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Sử dụng class strategy cho dark mode
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7fb',
          100: '#e1eff8',
          200: '#c5e2f3',
          300: '#9ecde9',
          400: '#6eaed5',
          500: '#4592bf',
          600: '#2b76a4', // Deep Sea Blue - Primary Button & Active
          700: '#205b80', // Hover
          800: '#1a4560',
          900: '#142f42', // Maritime Navy - Main Text
          950: '#0d1f2d',
        },
        ocean: {
          50: '#f0f7fb',
          100: '#e1eff8',
          200: '#c5e2f3',
          300: '#9ecde9',
          400: '#6eaed5',
          500: '#4592bf',
          600: '#2b76a4',
          700: '#205b80',
          800: '#1a4560',
          900: '#142f42',
        },
        sunrise: {
          50: '#fff5f2',
          100: '#fce8df',
          500: '#f05d3b', // Cam mặt trời mọc Monet
          600: '#d84827',
        },
        dark: {
          bg: '#1a1a1a',
          'bg-secondary': '#2d2d2d',
          'text-primary': '#ffffff',
          'text-secondary': '#a0a0a0',
        },
        slate: {
          850: '#172033',
        },
      },
      backgroundColor: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
      textColor: {
        dark: '#ffffff',
        light: '#000000',
      },
    },
  },
  plugins: [],
}
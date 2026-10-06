import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        compression(),
    ],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:7000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Keep libraries with a large parse cost out of the first route.
                // Feature pages are lazy-loaded in App.jsx; these stable vendor
                // chunks are then cached across their routes.
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    charts: ['chart.js', 'react-chartjs-2', 'recharts'],
                    media: ['react-player'],
                },
            },
        },
    },
})

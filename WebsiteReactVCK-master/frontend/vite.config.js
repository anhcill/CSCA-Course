import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        compression(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifestFilename: 'site.webmanifest',
            includeAssets: [
                'favicon.ico',
                'favicon.svg',
                'apple-touch-icon.png',
                'favicon-192x192.png',
                'favicon-512x512.png',
                'site.webmanifest',
                'robots.txt'
            ],
            manifest: {
                name: 'Moly Course — Hệ thống Khóa học & Luyện thi Trực tuyến',
                short_name: 'Moly Course',
                description: 'Moly Course — Nền tảng học tập & luyện thi trực tuyến chất lượng cao: chuyên sâu chuẩn đầu vào CSCA, tiếng Trung HSK, HSKK, hệ thống LMS làm bài tập & thi thử 24/7.',
                id: '/',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                orientation: 'portrait-primary',
                theme_color: '#dc2626',
                background_color: '#ffffff',
                lang: 'vi',
                categories: ['education', 'productivity'],
                icons: [
                    {
                        src: '/favicon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/favicon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: '/favicon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'images-cache',
                            expiration: {
                                maxEntries: 80,
                                maxAgeSeconds: 30 * 24 * 60 * 60
                            }
                        }
                    }
                ]
            }
        })
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

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
            // Activate new deployments on the next reload instead of leaving
            // an invisible waiting service worker serving the previous UI.
            registerType: 'autoUpdate',
            injectRegister: 'script',
            // Use public/site.webmanifest (linked once in index.html) as the single manifest source
            manifest: false,
            includeAssets: [
                'favicon.ico',
                'favicon.svg',
                'apple-touch-icon.png',
                'favicon-192x192.png',
                'favicon-512x512.png',
                'site.webmanifest',
                'robots.txt'
            ],
            workbox: {
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                // Cache the app shell at install time. Route assets are cached
                // on first use so installing an update does not download every
                // course, teacher and admin bundle at once.
                globPatterns: ['index.html', 'favicon.ico', 'favicon.svg', 'site.webmanifest'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//, /^\/assets\//, /\.[a-z0-9]+$/i],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'app-assets-cache',
                            plugins: [
                                {
                                    cacheWillUpdate: async ({ response }) => {
                                        if (!response || response.status !== 200) return null;
                                        const contentType = response.headers.get('content-type') || '';
                                        if (contentType.includes('text/html')) return null;
                                        return response;
                                    }
                                }
                            ],
                            expiration: {
                                maxEntries: 120,
                                maxAgeSeconds: 30 * 24 * 60 * 60
                            },
                            cacheableResponse: {
                                statuses: [200]
                            }
                        }
                    },
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
});

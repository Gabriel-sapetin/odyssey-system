/**
 * Odyssey – Service Worker
 * 
 * Provides offline caching for the PWA shell and static assets.
 * Uses a "stale-while-revalidate" strategy for pages and
 * "cache-first" for static assets (images, CSS, fonts).
 * 
 * API calls always go to the network (no caching of dynamic data).
 */

const CACHE_NAME = 'odyssey-v3';

// Core app shell files to pre-cache on install
const APP_SHELL = [
  '/os-odyssey/frontend/html/index.html',
  '/os-odyssey/frontend/html/login.html',
  '/os-odyssey/frontend/html/signup.html',
  '/os-odyssey/frontend/html/dashboard.html',
  '/os-odyssey/frontend/html/explore-lessons.html',
  '/os-odyssey/frontend/html/course.html',
  '/os-odyssey/frontend/css/styles.css',
  '/os-odyssey/frontend/css/mobile.css',
  '/os-odyssey/frontend/js/main.js',
  '/os-odyssey/frontend/js/mobile-nav.js',
  '/os-odyssey/frontend/js/supabase.js',
  '/os-odyssey/assets/favicon.png',
  '/os-odyssey/assets/penguin-flower-removebg-preview.png',
  '/os-odyssey/assets/pwa-icon-512.jpg',
  '/os-odyssey/manifest.json'
];

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────
// Clean up old caches when a new SW version activates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Media players use Range requests and receive 206 Partial Content responses.
  // Let the browser handle those directly; partial responses cannot be cached.
  if (request.headers.has('range')) return;

  // Skip API / Supabase / external service requests — always go to network
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('render.com') ||
    url.hostname.includes('cloudflare.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Static assets: cache-first (images, fonts, css, js)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, clone))
              .catch((error) => console.warn('[SW] Could not cache static asset:', error));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, clone))
              .catch((error) => console.warn('[SW] Could not cache page:', error));
          }
          return response;
        })
        .catch(() => {
          // If offline and not in cache, show a basic offline page
          if (cached) return cached;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Odyssey — Offline</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito",sans-serif;background:#0f0f1a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}.offline-card{max-width:400px}.offline-card h1{font-size:2rem;margin-bottom:1rem;background:linear-gradient(135deg,#7c4dff,#00bfa5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.offline-card p{font-size:1.1rem;opacity:.8;margin-bottom:2rem}.btn{display:inline-block;padding:.8rem 2rem;background:linear-gradient(135deg,#7c4dff,#6200ea);color:#fff;border:none;border-radius:12px;font-size:1rem;cursor:pointer;text-decoration:none}</style></head><body><div class="offline-card"><h1>You\'re Offline</h1><p>Odyssey needs an internet connection to load new content. Check your connection and try again.</p><button class="btn" onclick="location.reload()">Retry</button></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });

      return cached || fetchPromise;
    })
  );
});

/**
 * Checks whether a request path is a cacheable static asset
 */
function isStaticAsset(pathname) {
  return /\.(css|js|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|mp3|mp4|ico)$/i.test(pathname);
}

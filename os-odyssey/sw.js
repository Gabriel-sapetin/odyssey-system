/**
 * Odyssey – Service Worker
 * 
 * Provides offline caching for the PWA shell and static assets.
 * Uses "network-first" for CSS/JS (so updates show immediately),
 * "cache-first" for images/fonts, and "stale-while-revalidate" for pages.
 * 
 * API calls always go to the network (no caching of dynamic data).
 */

const CACHE_NAME = 'odyssey-v38';

// Core app shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/login',
  '/signup',
  '/dashboard',
  '/pdf-study',
  '/explore-lessons',
  '/course',
  '/classroom',
  '/profile',
  '/leaderboard',
  '/css/styles.css',
  '/css/mobile.css',
  '/js/main.js',
  '/js/flashcards.js',
  '/js/pdf-study.js',
  '/js/mobile-nav.js',
  '/js/supabase.js',
  '/assets/favicon.png',
  '/assets/bg-modules-winter.jpg',
  '/assets/pixelatedfile.png',
  '/assets/pixelatedchallenge.png',
  '/assets/pixelatedfile-icon.png',
  '/assets/pixelatedchallenge-icon.png',
  '/assets/penguin-flower-removebg-preview.png',
  '/assets/pwa-icon-512.jpg',
  '/manifest.json'
];

// ── Install ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(APP_SHELL).catch((err) => {
          console.warn('[SW] Pre-cache partial warning:', err);
        });
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

// ── Messages ────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Media players use Range requests and receive 206 Partial Content responses.
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

  // Mutable assets (CSS, JS): network-first so updates show immediately
  if (isMutableAsset(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, clone))
              .catch((error) => console.warn('[SW] Could not cache asset:', error));
          }
          return response;
        })
        .catch(() => caches.match(request))  // Fallback to cache if offline
    );
    return;
  }

  // Immutable assets: cache-first (images, fonts)
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

  // HTML pages: stale-while-revalidate with clean URL fallbacks
  event.respondWith(
    matchPage(request, url).then((cached) => {
      const cleanPath = getCleanPath(url.pathname);
      const fetchRequest = (cleanPath !== url.pathname)
        ? new Request(new URL(cleanPath, url.origin).href, {
            headers: request.headers,
            credentials: request.credentials
          })
        : request;

      const fetchPromise = fetch(fetchRequest)
        .then((response) => {
          if (response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(fetchRequest, clone);
                if (fetchRequest !== request) {
                  cache.put(request, response.clone());
                }
              })
              .catch((error) => console.warn('[SW] Could not cache page:', error));
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          return getOfflinePage();
        });

      return cached || fetchPromise;
    })
  );
});

/**
 * Returns clean path for a pathname
 */
function getCleanPath(pathname) {
  if (
    pathname === '/' ||
    pathname.endsWith('index.html') ||
    pathname === '/os-odyssey' ||
    pathname === '/os-odyssey/' ||
    pathname === '/$1'
  ) {
    return '/';
  }
  return pathname
    .replace(/\/os-odyssey\/frontend\/html\//, '/')
    .replace(/\/os-odyssey\//, '/')
    .replace(/\.html$/, '') || '/';
}

/**
 * Matches an HTML request in cache with fallback for clean URLs
 */
function matchPage(request, url) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    const cleanPath = getCleanPath(url.pathname);
    if (cleanPath !== url.pathname) {
      return caches.match(cleanPath).then((cleanMatch) => {
        if (cleanMatch) return cleanMatch;
        return undefined;
      });
    }
    return undefined;
  });
}

/**
 * Returns offline HTML fallback
 */
function getOfflinePage() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Odyssey — Offline</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito",sans-serif;background:#0f0f1a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}.offline-card{max-width:400px}.offline-card h1{font-size:2rem;margin-bottom:1rem;background:linear-gradient(135deg,#7c4dff,#00bfa5);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.offline-card p{font-size:1.1rem;opacity:.8;margin-bottom:2rem}.btn{display:inline-block;padding:.8rem 2rem;background:linear-gradient(135deg,#7c4dff,#6200ea);color:#fff;border:none;border-radius:12px;font-size:1rem;cursor:pointer;text-decoration:none}</style></head><body><div class="offline-card"><h1>You\'re Offline</h1><p>Odyssey needs an internet connection to load new content. Check your connection and try again.</p><button class="btn" onclick="location.reload()">Retry</button></div></body></html>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}

/**
 * Checks whether a request path is a mutable asset (CSS/JS) that should use network-first
 */
function isMutableAsset(pathname) {
  return /\.(css|js)$/i.test(pathname);
}

/**
 * Checks whether a request path is an immutable static asset (images, fonts, media)
 */
function isStaticAsset(pathname) {
  return /\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|mp3|mp4|ico)$/i.test(pathname);
}

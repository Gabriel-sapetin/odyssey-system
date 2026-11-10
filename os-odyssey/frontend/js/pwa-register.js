/**
 * Odyssey – PWA Registration & Install Prompt
 * 
 * - Registers the service worker
 * - Cleans up legacy service workers with old scopes
 * - Captures the beforeinstallprompt event
 * - Shows a custom in-app install banner on mobile
 */

(function () {
  'use strict';

  // ── Service Worker Registration & Migration ──────────────
  if ('serviceWorker' in navigator) {
    // 1. Clean up legacy service workers (e.g., from old scope /os-odyssey/)
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      const legacyScopeMarker = '/os' + '-odyssey/';
      for (const reg of registrations) {
        if (reg.scope && reg.scope.includes(legacyScopeMarker)) {
          console.log('[PWA] Unregistering legacy SW with scope:', reg.scope);
          reg.unregister();
        }
      }
    }).catch((err) => {
      console.warn('[PWA] Error checking legacy registrations:', err);
    });

    // 2. Register modern service worker at root scope
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope);

          // If a new worker is already waiting, tell it to take over
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Listen for new workers installing
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New worker installed, activating immediately');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });

    // 3. Auto-reload when new service worker takes control so users get fresh styles/scripts
    let isReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isReloading) {
        isReloading = true;
        console.log('[PWA] New SW controlling page — refreshing for fresh assets');
        window.location.reload();
      }
    });
  }

  // ── Install Prompt ───────────────────────────────────────
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default mini-infobar
    e.preventDefault();
    deferredPrompt = e;

    // Only show on mobile-width screens
    if (window.innerWidth > 768) return;

    // Don't show if user previously dismissed
    if (localStorage.getItem('odyssey-pwa-dismissed')) return;

    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    deferredPrompt = null;
    hideInstallBanner();
  });

  /**
   * Creates and shows a custom install banner at the bottom of the screen
   */
  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner__content">
        <img class="pwa-banner__icon" src="/assets/pwa-icon-512.jpg" alt="Odyssey" width="48" height="48" />
        <div class="pwa-banner__text">
          <strong>Install Odyssey</strong>
          <span>Add to your home screen for the best experience</span>
        </div>
      </div>
      <div class="pwa-banner__actions">
        <button class="pwa-banner__install" id="pwaBannerInstall">Install</button>
        <button class="pwa-banner__dismiss" id="pwaBannerDismiss">Not now</button>
      </div>
    `;

    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        banner.classList.add('pwa-banner--visible');
      });
    });

    document.getElementById('pwaBannerInstall').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Install prompt outcome:', outcome);
      deferredPrompt = null;
      hideInstallBanner();
    });

    document.getElementById('pwaBannerDismiss').addEventListener('click', () => {
      localStorage.setItem('odyssey-pwa-dismissed', 'true');
      hideInstallBanner();
    });
  }

  function hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('pwa-banner--visible');
      setTimeout(() => banner.remove(), 400);
    }
  }
})();

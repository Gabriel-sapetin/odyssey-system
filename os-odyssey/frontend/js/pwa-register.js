/**
 * Odyssey – PWA Registration & Install Prompt
 * 
 * - Registers the service worker
 * - Captures the beforeinstallprompt event
 * - Shows a custom in-app install banner on mobile
 */

(function () {
  'use strict';

  // ── Service Worker Registration ──────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/os-odyssey/sw.js', { scope: '/os-odyssey/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope);

          // Listen for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('[PWA] New service worker activated — content updated.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
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
    // Don't create duplicates
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner__content">
        <img class="pwa-banner__icon" src="/os-odyssey/assets/pwa-icon-512.jpg" alt="Odyssey" width="48" height="48" />
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

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        banner.classList.add('pwa-banner--visible');
      });
    });

    // Install button
    document.getElementById('pwaBannerInstall').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Install prompt outcome:', outcome);
      deferredPrompt = null;
      hideInstallBanner();
    });

    // Dismiss button
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

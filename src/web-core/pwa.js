const SW_PATH = './sw.js';

function setPwaState(state) {
  document.documentElement.dataset.gevPwa = state;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setPwaState('unsupported');
    return;
  }

  if (!window.isSecureContext) {
    setPwaState('insecure-context');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: './',
      updateViaCache: 'none',
    });

    setPwaState('registered');

    registration.addEventListener('updatefound', () => {
      setPwaState('updating');
    });
  } catch (error) {
    console.warn('[GEV PWA] Service worker registration failed:', error);
    setPwaState('registration-error');
  }
}

function install() {
  if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    setPwaState('standalone');
  }

  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true });
} else {
  install();
}

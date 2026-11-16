/**
 * VOICE • js/transitions.js
 * Snappy Page Transitions: Native View Transitions where supported,
 * with lime/orange curtain wipe fallback.
 */

import { getIsometricCubeLogoSvg } from './layout.js';

let isNavigating = false;

export function initPageTransitions() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  injectCurtain();
  bindLinkInterceptors();

  // Handle bfcache on browser back/forward buttons
  window.addEventListener('pageshow', (event) => {
    isNavigating = false;
    hideCurtain();
  });
}

function injectCurtain() {
  if (document.getElementById('pageTransitionCurtain')) return;

  const curtain = document.createElement('div');
  curtain.id = 'pageTransitionCurtain';
  curtain.className = 'page-transition-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = `
    <div class="curtain-bar-top"></div>
    <div class="curtain-bar-bottom"></div>
    <div class="curtain-spinner-wrap">
      ${getIsometricCubeLogoSvg(54)}
    </div>
  `;
  document.body.appendChild(curtain);
}

function showCurtain() {
  const curtain = document.getElementById('pageTransitionCurtain');
  if (!curtain) return;
  curtain.classList.add('active');
  requestAnimationFrame(() => {
    curtain.classList.add('wiping');
  });
}

function hideCurtain() {
  const curtain = document.getElementById('pageTransitionCurtain');
  if (!curtain) return;
  curtain.classList.remove('wiping');
  setTimeout(() => {
    curtain.classList.remove('active');
  }, 180);
}

function bindLinkInterceptors() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link || isNavigating) return;

    const href = link.getAttribute('href');
    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      link.hasAttribute('download') ||
      link.getAttribute('target') === '_blank' ||
      link.getAttribute('rel')?.includes('external')
    ) {
      return;
    }

    // Check if it's an internal relative page link
    try {
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // Don't transition if navigating to the same URL
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // If document supports native View Transitions, browser handles it natively
      if ('startViewTransition' in document) {
        // Allow native view transition navigation
        return;
      }

      // Fallback curtain wipe
      e.preventDefault();
      isNavigating = true;
      showCurtain();

      // Navigate after quick wipe
      setTimeout(() => {
        window.location.href = link.href;
      }, 200);

      // Safety timeout in case navigation stalls
      setTimeout(() => {
        isNavigating = false;
        hideCurtain();
      }, 1500);
    } catch (err) {
      // Allow default navigation if URL parsing fails
    }
  });
}

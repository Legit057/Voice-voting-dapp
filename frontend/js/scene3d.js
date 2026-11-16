/**
 * VOICE • js/scene3d.js
 * Sticker & Scene Layer Engine:
 * - Home page: stickers live inside hero section away from headline & deck (max 8)
 * - Other pages: fixed layer in left/right gutters (outer 6% width, max 4)
 * - Container: position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; contain: layout paint;
 * - Every sticker is position: absolute; left: 0; top: 0; placed ONLY by transform: translate3d(x, y, 0)
 * - Float/rotate animation is on inner child element (.sticker-anim) so it never overwrites translate3d
 * - Never render below 1100px width
 * - Zero added document height; never append after footer or into flow
 * - Pause on tab hidden, static on prefers-reduced-motion
 * - Live blockchain telemetry (Block #, Gas price) poller
 */

import { getReadProvider } from './web3.js';

let telemetryInterval = null;

export function init3dScene(containerId = 'hero3dScene') {
  startTelemetryPolling();
}

/**
 * Injects stickers per route into appropriate container
 */
export function initPerRouteStickers() {
  if (window.innerWidth < 1100) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const currentPath = window.location.pathname.toLowerCase();
  const isHome = document.body.getAttribute('data-scene') === 'home' ||
                 currentPath.endsWith('index.html') ||
                 currentPath.endsWith('/') ||
                 currentPath === '';

  if (isHome) {
    const hero = document.getElementById('hero');
    if (!hero) return;
    let container = hero.querySelector('.hero-stickers-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'hero-stickers-container';
      container.setAttribute('aria-hidden', 'true');
      hero.insertBefore(container, hero.firstChild);
    }
    renderHomeStickers(container);
    setupSceneOptimization(container);
  } else {
    let root = document.getElementById('scene-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'scene-root';
      root.setAttribute('aria-hidden', 'true');
      document.body.appendChild(root);
    }
    renderGutterStickers(root);
    setupSceneOptimization(root);
  }
}

/* --------------------------------------------------------------------------
   1. Sticker SVGs Library
   -------------------------------------------------------------------------- */
export const STICKER_SVGS = {
  star: `
    <path d="M50 4 L59 36 L91 27 L69 50 L91 73 L59 64 L50 96 L41 64 L9 73 L31 50 L9 27 L41 36 Z" 
          fill="#C6FF4D" stroke="#0A0A0A" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="10" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="3"/>
  `,
  smiley: `
    <circle cx="50" cy="50" r="44" fill="#FFC20E" stroke="#0A0A0A" stroke-width="5"/>
    <path d="M28 42c4-6 12-6 16 0" stroke="#0A0A0A" stroke-width="5" stroke-linecap="round"/>
    <circle cx="68" cy="40" r="5" fill="#0A0A0A"/>
    <path d="M26 56c4 16 34 16 48 0" stroke="#0A0A0A" stroke-width="5" stroke-linecap="round"/>
    <path d="M42 63c0 8 16 8 16 0" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="3"/>
  `,
  squiggle: `
    <path d="M10 30 Q 35 5 60 30 T 110 30" 
          stroke="#4C5DFF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 30 Q 35 5 60 30 T 110 30" 
          stroke="#C6FF4D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  padlock: `
    <path d="M14 18 V10 A10 10 0 0 1 34 10 V18" stroke="#FF5A1F" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="8" y="18" width="32" height="26" rx="6" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="3"/>
    <circle cx="24" cy="30" r="3" fill="#0A0A0A"/>
    <path d="M24 33 V37" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round"/>
  `,
  shieldCheck: `
    <path d="M24 4 L42 10 V24 C42 35 24 44 24 44 C24 44 6 35 6 24 V10 Z" 
          fill="#4C5DFF" stroke="#0A0A0A" stroke-width="3"/>
    <polyline points="14 24 21 31 34 17" stroke="#C6FF4D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  ballotBox: `
    <path d="M8 18 L24 8 L40 18 L24 28 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2.5"/>
    <path d="M8 18 L24 28 L24 44 L8 34 Z" fill="#D9430F" stroke="#0A0A0A" stroke-width="2.5"/>
    <path d="M40 18 L24 28 L24 44 L40 34 Z" fill="#A8320B" stroke="#0A0A0A" stroke-width="2.5"/>
    <rect x="20" y="4" width="8" height="12" rx="1" fill="#FFF8EE" stroke="#0A0A0A" stroke-width="2" transform="rotate(-10 20 4)"/>
  `,
  pencil: `
    <path d="M8 40 L6 48 L14 46 Z" fill="#FFC20E" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M8 40 L34 14 L40 20 L14 46 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M34 14 L40 8 L46 14 L40 20 Z" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="2"/>
  `,
  rocket: `
    <path d="M24 4 C18 10 14 22 14 36 L24 44 L34 36 C34 22 30 10 24 4 Z" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="2.5"/>
    <circle cx="24" cy="22" r="4" fill="#4C5DFF" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M14 36 L6 42 L14 44 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M34 36 L42 42 L34 44 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2"/>
    <polygon points="20 44 24 52 28 44" fill="#FFC20E"/>
  `,
  trophy: `
    <path d="M12 10 H36 V24 C36 30 30 36 24 36 C18 36 12 30 12 24 Z" fill="#FFC20E" stroke="#0A0A0A" stroke-width="2.5"/>
    <path d="M12 14 H6 C6 22 12 22 12 22 Z" fill="none" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M36 14 H42 C42 22 36 22 36 22 Z" fill="none" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M20 36 H28 V44 H20 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2"/>
    <path d="M14 44 H34 V48 H14 Z" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="2"/>
  `,
  crown: `
    <polygon points="6 38 12 16 24 28 36 16 42 38" fill="#FFC20E" stroke="#0A0A0A" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="6" y="38" width="36" height="6" rx="2" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2"/>
    <circle cx="12" cy="14" r="2.5" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="1.5"/>
    <circle cx="24" cy="26" r="2.5" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="1.5"/>
    <circle cx="36" cy="14" r="2.5" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="1.5"/>
  `,
  flame: `
    <path d="M24 6 C24 16 34 22 34 32 A10 10 0 0 1 14 32 C14 26 18 20 20 16 C20 22 22 26 24 26 C26 26 26 22 24 6 Z" 
          fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M24 26 C26 28 28 31 28 34 A4 4 0 0 1 20 34 C20 31 22 29 24 26 Z" fill="#FFC20E"/>
  `,
  hashChip: `
    <rect x="6" y="6" width="36" height="36" rx="8" fill="#141414" stroke="#C6FF4D" stroke-width="2.5"/>
    <line x1="16" y1="12" x2="16" y2="36" stroke="#C6FF4D" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="32" y1="12" x2="32" y2="36" stroke="#C6FF4D" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="10" y1="20" x2="38" y2="20" stroke="#FF5A1F" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="10" y1="28" x2="38" y2="28" stroke="#FF5A1F" stroke-width="2.5" stroke-linecap="round"/>
  `,
  clock: `
    <circle cx="24" cy="24" r="20" fill="#FFF8EE" stroke="#0A0A0A" stroke-width="3"/>
    <polyline points="24 12 24 24 32 24" stroke="#FF5A1F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="3" fill="#0A0A0A"/>
  `,
  brokenChain: `
    <path d="M10 24 A10 10 0 0 1 24 10 L30 10" stroke="#FF5A1F" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M38 24 A10 10 0 0 1 24 38 L18 38" stroke="#C6FF4D" stroke-width="4" stroke-linecap="round" fill="none"/>
    <line x1="18" y1="18" x2="30" y2="30" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round"/>
  `
};

export function getStickerSvg(key, size = 48) {
  const inner = STICKER_SVGS[key] || STICKER_SVGS.star;
  let vb = '0 0 48 48';
  if (key === 'star' || key === 'smiley') vb = '0 0 100 100';
  if (key === 'squiggle') vb = '0 0 120 40';
  return `
    <svg viewBox="${vb}" width="${size}" height="${size}" fill="none">
      ${inner}
    </svg>
  `;
}

/* --------------------------------------------------------------------------
   2. Render Stickers (Home Desktop: Max 8 away from headline/deck)
   -------------------------------------------------------------------------- */
function renderHomeStickers(container) {
  const rect = container.getBoundingClientRect();
  const w = rect.width || window.innerWidth;
  const h = rect.height || 750;

  // Max 8 stickers on Home Desktop, placed away from centered headline & deck
  const items = [
    { key: 'star', x: Math.round(w * 0.04), y: Math.round(h * 0.12), size: 54, anim: 1 },
    { key: 'smiley', x: Math.round(w * 0.05), y: Math.round(h * 0.40), size: 56, anim: 2 },
    { key: 'squiggle', x: Math.round(w * 0.06), y: Math.round(h * 0.68), size: 70, anim: 3 },
    { key: 'padlock', x: Math.round(w * 0.14), y: Math.round(h * 0.24), size: 44, anim: 1 },
    { key: 'shieldCheck', x: Math.round(w * 0.90), y: Math.round(h * 0.14), size: 48, anim: 2 },
    { key: 'ballotBox', x: Math.round(w * 0.88), y: Math.round(h * 0.42), size: 48, anim: 3 },
    { key: 'flame', x: Math.round(w * 0.89), y: Math.round(h * 0.70), size: 46, anim: 1 },
    { key: 'hashChip', x: Math.round(w * 0.80), y: Math.round(h * 0.22), size: 46, anim: 2 }
  ];

  container.innerHTML = items.map((item) => {
    const svg = getStickerSvg(item.key, item.size);
    return `
      <div class="scene-sticker" style="transform: translate3d(${item.x}px, ${item.y}px, 0);">
        <div class="sticker-anim sticker-anim-${item.anim}">
          ${svg}
        </div>
      </div>
    `;
  }).join('');
}

/* --------------------------------------------------------------------------
   3. Render Gutter Stickers (Other Pages: Max 4 in outer 6% margins)
   -------------------------------------------------------------------------- */
function renderGutterStickers(root) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const scene = document.body.getAttribute('data-scene') || 'polls';
  const scenePresets = {
    polls: ['ballotBox', 'shieldCheck', 'padlock', 'clock'],
    poll: ['ballotBox', 'flame', 'shieldCheck', 'star'],
    create: ['pencil', 'rocket', 'clock', 'ballotBox'],
    dashboard: ['trophy', 'flame', 'shieldCheck', 'star'],
    how: ['shieldCheck', 'padlock', 'clock', 'hashChip'],
    leaderboard: ['crown', 'trophy', 'flame', 'star'],
    verify: ['shieldCheck', 'hashChip', 'padlock', 'brokenChain'],
    404: ['brokenChain', 'smiley', 'hashChip', 'star']
  };
  const keys = scenePresets[scene] || ['star', 'shieldCheck', 'padlock', 'ballotBox'];

  const items = [
    // Left gutter (outer 6%)
    { key: keys[0], x: Math.round(w * 0.02), y: Math.round(h * 0.22), size: 46, anim: 1 },
    { key: keys[1], x: Math.round(w * 0.025), y: Math.round(h * 0.65), size: 44, anim: 2 },
    // Right gutter (outer 6%)
    { key: keys[2], x: Math.round(w * 0.94), y: Math.round(h * 0.26), size: 46, anim: 3 },
    { key: keys[3], x: Math.round(w * 0.935), y: Math.round(h * 0.68), size: 44, anim: 1 }
  ];

  root.innerHTML = items.map((item) => {
    const svg = getStickerSvg(item.key, item.size);
    return `
      <div class="scene-sticker" style="transform: translate3d(${item.x}px, ${item.y}px, 0);">
        <div class="sticker-anim sticker-anim-${item.anim}">
          ${svg}
        </div>
      </div>
    `;
  }).join('');
}

/* --------------------------------------------------------------------------
   4. Optimization: Pause Offscreen or Hidden Animations
   -------------------------------------------------------------------------- */
function setupSceneOptimization(container) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      container.classList.add('scene3d-paused');
    } else {
      container.classList.remove('scene3d-paused');
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth < 1100) {
      container.innerHTML = '';
    } else if (container.children.length === 0) {
      initPerRouteStickers();
    }
  });
}

/* --------------------------------------------------------------------------
   5. Telemetry Poller: Block & Gas Price (Every 12s)
   -------------------------------------------------------------------------- */
async function updateTelemetryValues() {
  const blockEl = document.getElementById('footerBlockNumber');
  const gasEl = document.getElementById('footerGasPrice');

  try {
    const provider = getReadProvider();
    if (!provider) return;

    const [blockNum, feeData] = await Promise.all([
      provider.getBlockNumber(),
      provider.getFeeData()
    ]);

    if (blockEl && blockNum) {
      blockEl.textContent = blockNum.toLocaleString();
    }

    if (feeData && feeData.gasPrice && window.ethers) {
      const rawGwei = Number(window.ethers.formatUnits(feeData.gasPrice, 'gwei'));
      const gwei = rawGwei < 0.01 ? '< 0.01' : rawGwei.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      if (gasEl) gasEl.textContent = `${gwei} Gwei`;
    }
  } catch (err) {
    console.warn('Telemetry polling error:', err);
  }
}

function startTelemetryPolling() {
  updateTelemetryValues();
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryInterval = setInterval(updateTelemetryValues, 12000);
}

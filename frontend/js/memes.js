/**
 * MULTIPOLL • js/memes.js
 * Meme Manifest Loader, Media Renderer (HTML5 Video & Image), Fallback SVGs
 */

let cachedMemes = null;

const FALLBACK_MEMES = [
  {
    type: 'svg',
    caption: 'Ethereum to the Moon',
    alt: 'To the Moon character',
    tag: 'HOT TAKES',
    color: '#FF5A1F',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="30" fill="#FF5A1F"/><path d="M50 30 L60 55 L40 55 Z" fill="#FFF8EE"/></svg>`
  },
  {
    type: 'svg',
    caption: 'Watching the results nervously',
    alt: 'Shocked face character',
    tag: 'MEME VOTING',
    color: '#FFC20E',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="34" fill="#FFC20E"/><circle cx="38" cy="45" r="5" fill="#0A0A0A"/><circle cx="62" cy="45" r="5" fill="#0A0A0A"/><ellipse cx="50" cy="68" rx="8" ry="12" fill="#0A0A0A"/></svg>`
  },
  {
    type: 'svg',
    caption: 'Which coin are you still holding?',
    alt: 'Sleepy mascot character',
    tag: 'MEME VOTING',
    color: '#4C5DFF',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="32" fill="#4C5DFF"/><path d="M35 48 Q 45 42 55 48" stroke="#FFF8EE" stroke-width="4" stroke-linecap="round"/></svg>`
  },
  {
    type: 'svg',
    caption: 'Everyone gets one vote',
    alt: 'Voting bird character',
    tag: 'ON-CHAIN VOTING',
    color: '#C6FF4D',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="30" fill="#C6FF4D"/><polygon points="40,40 60,50 40,60" fill="#0A0A0A"/></svg>`
  },
  {
    type: 'svg',
    caption: 'Results are in',
    alt: 'Chart celebration character',
    tag: 'DEBATES VOTING',
    color: '#7B6CFF',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="32" fill="#7B6CFF"/><path d="M30 70 L50 45 L70 30" stroke="#FFF8EE" stroke-width="6" stroke-linecap="round"/></svg>`
  },
  {
    type: 'svg',
    caption: 'Decentralized Consensus',
    alt: 'Consensus badge character',
    tag: 'GOVERNANCE',
    color: '#00A651',
    fit: 'contain',
    position: 'center',
    svg: `<svg viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="16" fill="#141414"/><circle cx="50" cy="50" r="30" fill="#00A651"/><path d="M38 52 L46 60 L64 42" stroke="#FFF8EE" stroke-width="6" stroke-linecap="round"/></svg>`
  }
];

export async function loadMemes() {
  if (cachedMemes && cachedMemes.length > 0) return cachedMemes;

  try {
    const res = await fetch('assets/memes/memes.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedMemes = data;
      return cachedMemes;
    }
  } catch (err) {
    console.warn('Could not load assets/memes/memes.json, using fallback SVG characters:', err);
  }

  cachedMemes = FALLBACK_MEMES;
  return cachedMemes;
}

export function renderMemeMedia(meme, options = {}) {
  const {
    width = 320,
    height = 240,
    className = '',
    lazy = true,
    aspect = ''
  } = options;

  if (!meme) {
    return `<div class="${className}" style="width:${width}px;height:${height}px;background:#1a1a1a;"></div>`;
  }

  const fit = meme.fit || 'contain';
  const position = meme.position || 'center';
  const styleAttr = `object-fit:${fit};object-position:${position};`;

  if (meme.type === 'video') {
    const posterAttr = meme.poster ? `poster="${meme.poster}"` : '';
    const webmSource = meme.webm ? `<source src="${meme.webm}" type="video/webm">` : '';
    const mp4Source = meme.src ? `<source src="${meme.src}" type="video/mp4">` : '';

    return `
      <video class="${className}" autoplay loop muted playsinline preload="metadata" ${posterAttr} width="${width}" height="${height}" style="${styleAttr}">
        ${webmSource}
        ${mp4Source}
      </video>
    `;
  }

  if (meme.type === 'image') {
    const loadingAttr = lazy ? 'loading="lazy"' : 'loading="eager"';
    return `
      <img src="${meme.src}" alt="${meme.alt || meme.caption}" width="${width}" height="${height}" ${loadingAttr} class="${className}" style="${styleAttr}" />
    `;
  }

  // Fallback SVG
  if (meme.svg) {
    return `<div class="${className}" style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;">${meme.svg}</div>`;
  }

  return `<div class="${className}" style="width:${width}px;height:${height}px;background:#222;"></div>`;
}

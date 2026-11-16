/**
 * VOICE • js/index.js
 * Home Page Logic:
 * - Isolated Initializers (Layout, Theme, 3D Scene, Hero Fan, Marquee, Stats, FAQ)
 * - Tap-to-Flip 3D Meme Card Fan with Physics, Sheen, State Machine & Auto-Shuffle
 * - Guaranteed 3 Distinct Polls across Card Backs with formatTimeLeft String Guard
 * - Two-Row Infinite Meme Marquee
 * - On-Chain Live Stats with Skeleton Loaders & Retry Fallbacks
 * - 3 Trending Ballots Loader with Soft-Delete & Restore Controls
 * - 6-Question Curated FAQ Accordion
 */

import { injectLayout } from './layout.js';
import { loadMemes, renderMemeMedia } from './memes.js';
import { fetchAllPolls, createPollCardHtml, executeCancelPoll, executeEndPollEarly, executeArchivePoll, executeUnarchivePoll } from './polls-service.js';
import { animateNumber, hidePollForMe, showToast, shortenAddress, getIdenticonUrl, createIdenticonSvg, formatTimeLeft, guardString } from './ui.js';
import { init3dScene } from './scene3d.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Shared Layout (Navbar, Footer, Theme, Web3 State, Route Stickers, Transitions)
  try {
    injectLayout();
  } catch (err) {
    console.error('Layout initialization failed:', err);
  }

  // 2. Global Card Action Handlers
  try {
    setupGlobalCardActionHandler();
  } catch (err) {
    console.error('Card action handler setup failed:', err);
  }

  // 3. Pure CSS/SVG 3D Background Scene behind Hero
  try {
    init3dScene('hero3dScene');
  } catch (err) {
    console.error('3D Scene initialization failed:', err);
  }


  // 5. Infinite Meme Marquee
  try {
    await initMemeMarquee();
  } catch (err) {
    console.error('Meme marquee initialization failed:', err);
  }

  // 6. Hero 3D Card Fan (Render immediately with manifest data so hero is never blank)
  try {
    await initHeroMemeFan();
  } catch (err) {
    console.error('Hero meme fan initial render failed:', err);
  }

  // 7. On-Chain Stats & Trending Ballots (Loads asynchronously, isolated from layout)
  loadOnChainPollsAndStats();

  // 8. Re-load stats and cards when wallet connection changes
  window.addEventListener('walletStateChanged', () => {
    loadOnChainPollsAndStats();
  });

  // 9. Initialize Home FAQ Accordion
  try {
    initHomeFaq();
  } catch (err) {
    console.error('FAQ accordion initialization failed:', err);
  }
});

/* --------------------------------------------------------------------------
   1. Hero 3D Card Deck (Rebuilt Minimal, Flagged & Reliable)
   -------------------------------------------------------------------------- */
const DECK_FX = {
  tilt: false,
  glare: false,
  shuffle: false,
  drag: false,
  float: false,
  entrance: true
};

// Flagged stubs for optional future extensions
function applyTilt(el, e) { if (!DECK_FX.tilt) return; }
function applyGlare(el, e) { if (!DECK_FX.glare) return; }
function startShuffle() { if (!DECK_FX.shuffle) return; }
function enableDrag(el) { if (!DECK_FX.drag) return; }
function enableFloat(el) { if (!DECK_FX.float) return; }

function renderBack(poll) {
  if (!poll) {
    return `
      <div class="card-back-loading">
        <div class="skeleton" style="height: 20px; width: 50%; margin-bottom: 12px; border-radius: 4px;"></div>
        <div class="skeleton" style="height: 18px; width: 90%; margin-bottom: 8px; border-radius: 4px;"></div>
        <div class="skeleton" style="height: 18px; width: 75%; border-radius: 4px;"></div>
      </div>
    `;
  }

  // Convert all values to string or number first
  const id = poll.id != null ? String(poll.id) : '';
  const title = guardString(poll.title || '—');
  const isSample = Boolean(poll.isSample);
  const tagText = isSample ? 'SAMPLE POLL' : (poll.isEnded ? 'ENDED BALLOT' : 'ACTIVE BALLOT');
  const tagBg = isSample ? 'var(--accent-orange)' : (poll.isEnded ? '#777' : 'var(--accent-lime)');
  const tagColor = '#0A0A0A';

  const creator = poll.creator ? shortenAddress(String(poll.creator)) : '—';
  const creatorAvatar = poll.creator ? getIdenticonUrl(String(poll.creator), 20) : '';
  const totalVotes = poll.totalVotes != null ? Number(poll.totalVotes) : 0;
  const timeLeft = poll.timeLeft ? String(poll.timeLeft) : (poll.endTime ? formatTimeLeft(poll.endTime, poll.isCancelled) : '—');
  const pollLink = poll.link ? String(poll.link) : (id ? `poll.html?id=${id}` : 'polls.html');

  return `
    <div>
      <div class="card-back-tag" style="background:${tagBg}; color:${tagColor}; display:inline-block; padding:2px 8px; border-radius:var(--radius-full); font-size:0.68rem; font-weight:800;">
        ${tagText}
      </div>
      <h4 class="card-back-question" title="${title}">${title}</h4>
      <div class="card-back-meta">
        <div class="card-back-creator">
          ${creatorAvatar ? `<img src="${creatorAvatar}" class="card-back-creator-avatar" alt="" />` : ''}
          <span>Created by <strong>${creator}</strong></span>
        </div>
        <div class="card-back-time">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${timeLeft}</span>
          <span style="margin: 0 4px; opacity: 0.5;">&bull;</span>
          <span>${totalVotes} votes cast</span>
        </div>
      </div>
    </div>

    <div class="card-back-actions">
      <a href="${pollLink}" class="btn-primary" style="width:100%; justify-content:center;">
        <span>Vote Now</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </a>
      <button type="button" class="btn-secondary flip-back-btn" style="width:100%; justify-content:center; padding:8px 12px; font-size:0.8rem;">
        Back to Artwork
      </button>
    </div>
  `;
}

async function initHeroMemeFan(polls = null) {
  const container = document.getElementById('heroFanContainer');
  if (!container) return;

  const memes = await loadMemes();
  const leftMeme = memes[0] || { id: 'meme-01', caption: 'Which coin are you still holding?', color: '#6B6BFF', tag: 'MEME VOTING' };
  const centerMeme = memes.find(m => m.type === 'video') || memes[3] || memes[0];
  const rightMeme = memes[1] || memes[2] || { id: 'meme-02', caption: 'Watching results nervously?', color: '#FFB800', tag: 'HOT TAKES' };

  // Query live active polls vs ended polls
  const now = Math.floor(Date.now() / 1000);
  const activePolls = Array.isArray(polls)
    ? polls.filter(p => !p.isCancelled && !p.archived && Number(p.endTime) > now)
    : [];
  const endedPolls = Array.isArray(polls)
    ? polls.filter(p => !p.archived && (Number(p.endTime) <= now || p.isCancelled))
    : [];

  // 3 Distinct Sample Polls for fallback
  const samplePolls = [
    {
      title: 'Should Doge be the official gas currency of Ethereum Sepolia?',
      creator: '0x1111111111111111111111111111111111111111',
      timeLeft: '3d 12h left',
      totalVotes: 142,
      isSample: true,
      link: `create.html?title=${encodeURIComponent('Should Doge be the official gas currency of Ethereum Sepolia?')}&options=${encodeURIComponent('Yes, much efficiency, very gas|No, keep ETH only|Maybe on an L3')}`
    },
    {
      title: 'Is Vitalik actually Satoshi Nakamoto in disguise?',
      creator: '0x2222222222222222222222222222222222222222',
      timeLeft: '5d 8h left',
      totalVotes: 389,
      isSample: true,
      link: `create.html?title=${encodeURIComponent('Is Vitalik actually Satoshi Nakamoto in disguise?')}&options=${encodeURIComponent('Definitely yes|Mathematically impossible|He was only 15 in 2008')}`
    },
    {
      title: 'Tabs or Spaces for smart contract Solidity development?',
      creator: '0x3333333333333333333333333333333333333333',
      timeLeft: '1d 4h left',
      totalVotes: 512,
      isSample: true,
      link: `create.html?title=${encodeURIComponent('Tabs or Spaces for smart contract Solidity development?')}&options=${encodeURIComponent('Tabs (customizable width)|Spaces (exact rendering)|Format on save solves this')}`
    }
  ];

  // Map 3 distinct items
  const pollSlots = [];
  const pollPool = [...activePolls, ...endedPolls];

  for (let i = 0; i < 3; i++) {
    if (pollPool[i]) {
      const p = pollPool[i];
      pollSlots.push({
        id: p.id,
        title: p.title,
        creator: p.creator,
        timeLeft: formatTimeLeft(p.endTime, p.isCancelled),
        totalVotes: p.totalVotes || 0,
        isEnded: Number(p.endTime) <= now || p.isCancelled,
        isSample: false,
        link: `poll.html?id=${p.id}`
      });
    } else {
      pollSlots.push(samplePolls[i]);
    }
  }

  // Cards Data: Left is slot 0, Center is slot 1, Right is slot 2
  const cardsData = [
    {
      slot: 'left',
      posClass: 'fan-left',
      meme: leftMeme,
      color: leftMeme.color || '#6B6BFF',
      tag: leftMeme.tag || 'MEME VOTING',
      caption: leftMeme.caption || 'Which coin are you still holding?',
      poll: pollSlots[0]
    },
    {
      slot: 'center',
      posClass: 'fan-center',
      meme: centerMeme,
      color: centerMeme.color || '#FF5A1F',
      tag: centerMeme.tag || 'ON-CHAIN VOTING',
      caption: centerMeme.caption || 'Everyone gets one vote',
      poll: pollSlots[1]
    },
    {
      slot: 'right',
      posClass: 'fan-right',
      meme: rightMeme,
      color: rightMeme.color || '#FFB800',
      tag: rightMeme.tag || 'HOT TAKES',
      caption: rightMeme.caption || 'Watching the results nervously?',
      poll: pollSlots[2]
    }
  ];

  const html = cardsData.map((data, idx) => `
    <div class="card-slot ${data.posClass}" data-slot="${data.slot}" data-card-idx="${idx}" tabindex="0" role="button" aria-pressed="false" aria-label="Meme ballot: ${data.poll ? data.poll.title : 'Preview'}">
      <div class="card-flip">
        <!-- Front Face -->
        <div class="face-front">
          <div class="card-front-top">
            <span class="card-category-badge" style="background:${data.color}; color:${data.color === '#0B2A14' || data.color === '#0A0A0A' ? '#FFF' : '#0A0A0A'};">
              ${data.tag}
            </span>
            <span class="card-flip-hint">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Tap to Flip
            </span>
          </div>

          <div class="card-media-box" style="background:${data.color}18;">
            ${renderMemeMedia(data.meme, { width: 320, height: 260, className: 'card-media' })}
          </div>

          <div class="card-front-bottom">
            ${data.caption}
          </div>
        </div>

        <!-- Back Face -->
        <div class="face-back">
          ${renderBack(data.poll)}
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = guardString(html);

  // Setup Interaction
  setupHeroFanInteraction(container);
}

function setupHeroFanInteraction(container) {
  const cardSlots = Array.from(container.querySelectorAll('.card-slot'));

  function unflipAll() {
    cardSlots.forEach(slot => {
      slot.classList.remove('is-flipped');
      slot.setAttribute('aria-pressed', 'false');
    });
  }

  // Click outside unflips
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      unflipAll();
    }
  });

  // Escape unflips
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      unflipAll();
    }
  });

  cardSlots.forEach((slot) => {
    // Back to artwork button
    slot.querySelector('.flip-back-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      slot.classList.remove('is-flipped');
      slot.setAttribute('aria-pressed', 'false');
    });

    // Click toggle flip (only one flipped at a time)
    slot.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('.flip-back-btn')) return;
      const isAlreadyFlipped = slot.classList.contains('is-flipped');
      unflipAll();
      if (!isAlreadyFlipped) {
        slot.classList.add('is-flipped');
        slot.setAttribute('aria-pressed', 'true');
      }
    });

    // Keyboard support: Enter / Space
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('a') || e.target.closest('button')) return;
        e.preventDefault();
        const isAlreadyFlipped = slot.classList.contains('is-flipped');
        unflipAll();
        if (!isAlreadyFlipped) {
          slot.classList.add('is-flipped');
          slot.setAttribute('aria-pressed', 'true');
        }
      }
    });
  });
}

/* --------------------------------------------------------------------------
   3. Two-Row Infinite Meme Marquee
   -------------------------------------------------------------------------- */
async function initMemeMarquee() {
  const rowLeft = document.getElementById('marqueeRowLeft');
  const rowRight = document.getElementById('marqueeRowRight');
  if (!rowLeft || !rowRight) return;

  const memes = await loadMemes();
  const marqueeItems = [...memes, ...memes, ...memes];

  const buildItemsHtml = (items) => items.map((meme) => `
    <div class="marquee-card">
      <div class="marquee-media">
        ${renderMemeMedia(meme, { width: 220, height: 110, className: 'marquee-media-item' })}
      </div>
      <div class="marquee-caption">${meme.caption}</div>
    </div>
  `).join('');

  rowLeft.innerHTML = buildItemsHtml(marqueeItems);
  rowRight.innerHTML = buildItemsHtml([...marqueeItems].reverse());
}

/* --------------------------------------------------------------------------
   4. Stats & 3 Trending Polls (Asynchronous with Fallbacks)
   -------------------------------------------------------------------------- */
async function loadOnChainPollsAndStats() {
  const statPollsEl = document.getElementById('statTotalPolls');
  const statVotesEl = document.getElementById('statTotalVotes');
  const statActiveEl = document.getElementById('statActivePolls');
  const gridContainer = document.getElementById('trendingPollsGrid');

  try {
    const polls = await fetchAllPolls();

    // Compute Stats
    const totalPolls = polls.length;
    let totalVotes = 0;
    let activePolls = 0;
    const now = Math.floor(Date.now() / 1000);

    polls.forEach((p) => {
      totalVotes += p.totalVotes;
      if (!p.isCancelled && !p.archived && p.endTime > now) {
        activePolls++;
      }
    });

    if (statPollsEl) {
      statPollsEl.classList.remove('skeleton-loader');
      animateNumber(statPollsEl, totalPolls);
    }
    if (statVotesEl) {
      statVotesEl.classList.remove('skeleton-loader');
      animateNumber(statVotesEl, totalVotes);
    }
    if (statActiveEl) {
      statActiveEl.classList.remove('skeleton-loader');
      animateNumber(statActiveEl, activePolls);
    }

    // Refresh hero fan cards with live active poll links
    try {
      await initHeroMemeFan(polls);
    } catch (err) {
      console.error('Updating hero fan with live poll targets failed:', err);
    }

    // Render Trending Ballots (up to 3)
    if (gridContainer) {
      const visiblePolls = polls.filter((p) => !p.archived);
      const trending = [...visiblePolls].sort((a, b) => b.totalVotes - a.totalVotes || b.id - a.id).slice(0, 3);

      if (trending.length === 0) {
        gridContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <img src="assets/stickers/smiley.svg" alt="Smiley" class="empty-state-sticker" />
            <h3 class="empty-state-title">No Polls Yet</h3>
            <p class="empty-state-desc">Be the first to launch an on-chain ballot on Ethereum Sepolia!</p>
            <a href="create.html" class="btn-primary">Create the First Poll</a>
          </div>
        `;
      } else {
        gridContainer.innerHTML = trending.map((p) => createPollCardHtml(p)).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load on-chain polls:', err);

    if (statPollsEl) statPollsEl.classList.remove('skeleton-loader');
    if (statVotesEl) statVotesEl.classList.remove('skeleton-loader');
    if (statActiveEl) statActiveEl.classList.remove('skeleton-loader');

    const statsContainer = document.querySelector('.stats-banner');
    if (statsContainer && !document.getElementById('statsErrorNotice')) {
      const errorHtml = `
        <div id="statsErrorNotice" style="text-align:center; padding:12px; margin-top:12px;">
          <span style="color:var(--accent-orange); font-family:var(--font-mono); font-size:0.85rem; margin-right:12px;">
            Could not load on-chain data
          </span>
          <button type="button" id="btnRetryStats" class="btn-secondary" style="padding:4px 12px; font-size:0.75rem;">
            Retry
          </button>
        </div>
      `;
      statsContainer.querySelector('.container')?.insertAdjacentHTML('beforeend', errorHtml);
      document.getElementById('btnRetryStats')?.addEventListener('click', () => {
        document.getElementById('statsErrorNotice')?.remove();
        if (statPollsEl) statPollsEl.classList.add('skeleton-loader');
        if (statVotesEl) statVotesEl.classList.add('skeleton-loader');
        if (statActiveEl) statActiveEl.classList.add('skeleton-loader');
        loadOnChainPollsAndStats();
      });
    }

    if (gridContainer) {
      gridContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <img src="assets/stickers/smiley.svg" alt="Smiley" class="empty-state-sticker" />
          <h3 class="empty-state-title">Could Not Load Trending Ballots</h3>
          <p class="empty-state-desc">The Sepolia network connection is currently busy. You can retry or deploy a new poll.</p>
          <div style="display:flex; gap:12px; justify-content:center; margin-top:16px;">
            <button type="button" class="btn-primary" onclick="window.location.reload()">Retry Connection</button>
            <a href="create.html" class="btn-secondary">Create a Poll</a>
          </div>
        </div>
      `;
    }
  }
}

/* --------------------------------------------------------------------------
   5. Curated Home FAQ Accordion
   -------------------------------------------------------------------------- */
function initHomeFaq() {
  const faqItems = document.querySelectorAll('.faq-accordion-item');
  faqItems.forEach((item) => {
    const btn = item.querySelector('.faq-question-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close other open items
      faqItems.forEach((other) => {
        if (other !== item) other.classList.remove('open');
      });
      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

/* --------------------------------------------------------------------------
   6. Global Card Action Handler
   -------------------------------------------------------------------------- */
function setupGlobalCardActionHandler() {
  window.handlePollCardAction = async (action, pollId) => {
    if (action === 'endEarly') {
      await executeEndPollEarly(pollId, () => loadOnChainPollsAndStats());
    } else if (action === 'cancel') {
      await executeCancelPoll(pollId, () => loadOnChainPollsAndStats());
    } else if (action === 'archive') {
      await executeArchivePoll(pollId, () => loadOnChainPollsAndStats());
    } else if (action === 'unarchive') {
      await executeUnarchivePoll(pollId, () => loadOnChainPollsAndStats());
    } else if (action === 'hideForMe') {
      hidePollForMe(pollId);
      showToast(`Poll #${pollId} hidden from your view.`, 'info');
      const card = document.querySelector(`[data-poll-id="${pollId}"]`);
      if (card) card.remove();
    }
  };
}

/**
 * MULTIPOLL • js/leaderboard.js
 * Leaderboard & XP Page: Top Voters, Top Creators, User XP Progress Card
 * Subscribes to single source of truth wallet.js
 */

import { injectLayout } from './layout.js';
import { fetchLeaderboardStats, getUserLevelInfo } from './xp-service.js';
import * as wallet from './wallet.js';
import { createIdenticonSvg, shortenAddress } from './ui.js';

let activeLeaderboardTab = 'voters'; // 'voters' | 'creators'
let cachedStats = null;
let leaderboardError = null;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in leaderboard.js:', e); }
  try { bindTabEvents(); } catch (e) { console.error('bindTabEvents failed:', e); }

  await loadLeaderboard();

  await wallet.ready;
  wallet.subscribe(() => {
    try { updateUserXpCard(); } catch (e) { console.error('updateUserXpCard failed:', e); }
  });
});

function bindTabEvents() {
  const tabVoters = document.getElementById('tabTopVoters');
  const tabCreators = document.getElementById('tabTopCreators');

  if (tabVoters) {
    tabVoters.addEventListener('click', () => {
      tabVoters.classList.add('active');
      if (tabCreators) tabCreators.classList.remove('active');
      activeLeaderboardTab = 'voters';
      renderTable();
    });
  }

  if (tabCreators) {
    tabCreators.addEventListener('click', () => {
      tabCreators.classList.add('active');
      if (tabVoters) tabVoters.classList.remove('active');
      activeLeaderboardTab = 'creators';
      renderTable();
    });
  }
}

async function loadLeaderboard() {
  const tableContainer = document.getElementById('leaderboardTableBody');
  if (tableContainer) {
    tableContainer.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">
          Querying on-chain VoteCast & PollCreated logs on Sepolia...
        </td>
      </tr>
    `;
  }

  try {
    cachedStats = await fetchLeaderboardStats();
    leaderboardError = null;
  } catch (err) {
    console.error('loadLeaderboard error:', err);
    leaderboardError = err;
  }

  updateUserXpCard();
  renderTable();
}

function updateUserXpCard() {
  const userAddr = wallet.state.address;
  const card = document.getElementById('userXpCard');
  if (!card) return;

  if (wallet.state.status === 'pending') {
    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px;">
        <div class="skeleton-line" style="width:44px; height:44px; border-radius:50%;"></div>
        <div>
          <div class="skeleton-line" style="width:160px; height:20px; margin-bottom:8px;"></div>
          <div class="skeleton-line" style="width:220px; height:14px;"></div>
        </div>
      </div>
    `;
    return;
  }

  if (!userAddr) {
    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div>
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--text);">Connect Wallet to Track XP</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
            Earn 10 XP per vote cast and 25 XP per poll created.
          </p>
        </div>
        <button type="button" class="btn-primary" onclick="document.getElementById('walletConnectBtn')?.click()">
          Connect Wallet
        </button>
      </div>
    `;
    return;
  }

  const info = getUserLevelInfo(userAddr);
  const avatar = createIdenticonSvg(userAddr, 44);

  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px;">
      <div style="display:flex; align-items:center; gap:16px;">
        ${avatar}
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:700; color:var(--text);">${shortenAddress(userAddr)}</span>
            <span class="wallet-lvl-chip">LVL ${info.level}</span>
          </div>
          <div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px;">
            Total: <strong style="color:var(--accent-lime);">${info.xp} XP</strong> &bull; Next Level in <strong>${100 - info.progressInLevel} XP</strong>
          </div>
        </div>
      </div>

      <!-- Level Progress Bar -->
      <div style="min-width: 200px; flex: 1; max-width: 320px;">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:6px;">
          <span>Level ${info.level}</span>
          <span>${info.progressInLevel} / 100 XP</span>
          <span>Level ${info.level + 1}</span>
        </div>
        <div class="xp-progress-bar">
          <div class="xp-progress-fill" style="width: ${info.progressInLevel}%;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderTable() {
  const tbody = document.getElementById('leaderboardTableBody');
  if (!tbody) return;

  if (leaderboardError) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px;">
          <div style="color:var(--accent-red); margin-bottom:12px;">Could not load data from the network</div>
          <button type="button" class="btn-primary" onclick="loadLeaderboard()">Retry</button>
        </td>
      </tr>
    `;
    return;
  }

  if (!cachedStats) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">
          Loading leaderboard...
        </td>
      </tr>
    `;
    return;
  }

  const list = activeLeaderboardTab === 'voters'
    ? cachedStats.topVoters
    : cachedStats.topCreators;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">
          No participants recorded on Sepolia yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((user, idx) => {
    const rank = idx + 1;
    const rankBadge = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'other';
    const avatar = createIdenticonSvg(user.address, 24);
    const short = shortenAddress(user.address);
    const scoreVal = activeLeaderboardTab === 'voters' ? user.votes : user.polls;
    const scoreLabel = activeLeaderboardTab === 'voters' ? 'votes' : 'polls';

    return `
      <tr>
        <td style="font-weight:700;">
          <span class="rank-badge rank-${rankBadge}">#${rank}</span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            ${avatar}
            <span style="font-family:var(--font-mono); font-weight:600;">${short}</span>
          </div>
        </td>
        <td>
          <span class="wallet-lvl-chip">LVL ${user.level}</span>
        </td>
        <td style="font-weight:700; color:var(--accent-lime);">
          ${user.xp} XP
        </td>
        <td style="color:var(--text-muted);">
          ${scoreVal} ${scoreLabel}
        </td>
      </tr>
    `;
  }).join('');
}

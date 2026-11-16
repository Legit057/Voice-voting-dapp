/**
 * MULTIPOLL • js/leaderboard.js
 * Leaderboard & XP Page: Top Voters, Top Creators, User XP Progress Card
 */

import { injectLayout } from './layout.js';
import { fetchLeaderboardStats, getUserLevelInfo } from './xp-service.js';
import { getCurrentAccount } from './web3.js';
import { createIdenticonSvg, shortenAddress } from './ui.js';

let activeLeaderboardTab = 'voters'; // 'voters' | 'creators'
let cachedStats = null;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in leaderboard.js:', e); }
  try { bindTabEvents(); } catch (e) { console.error('bindTabEvents failed:', e); }
  try { await loadLeaderboard(); } catch (e) { console.error('loadLeaderboard failed:', e); }

  window.addEventListener('walletStateChanged', () => {
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

  cachedStats = await fetchLeaderboardStats();
  updateUserXpCard();
  renderTable();
}

function updateUserXpCard() {
  const userAddr = getCurrentAccount();
  const card = document.getElementById('userXpCard');
  if (!card) return;

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
      <div style="flex:1; max-width:320px; min-width:200px;">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-family:var(--font-mono); margin-bottom:4px; color:var(--text-muted);">
          <span>Level ${info.level}</span>
          <span>Level ${info.level + 1}</span>
        </div>
        <div style="height:10px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-full); overflow:hidden;">
          <div style="width:${info.progressInLevel}%; height:100%; background:var(--accent-lime); transition:width 0.4s ease;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderTable() {
  const tableContainer = document.getElementById('leaderboardTableBody');
  if (!tableContainer || !cachedStats) return;

  const list = activeLeaderboardTab === 'voters' ? cachedStats.topVoters : cachedStats.topCreators;

  if (list.length === 0) {
    tableContainer.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:48px; color:var(--text-muted);">
          No on-chain activity recorded in this category yet.
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = list.map((item, idx) => {
    const isTop3 = idx < 3;
    const rankBadgeClass = idx === 0 ? 'rank-gold' : (idx === 1 ? 'rank-silver' : (idx === 2 ? 'rank-bronze' : 'rank-normal'));
    const shortAddr = shortenAddress(item.address);
    const avatar = createIdenticonSvg(item.address, 28);

    const primaryMetric = activeLeaderboardTab === 'voters'
      ? `${item.votes} Votes`
      : `${item.polls} Polls`;

    return `
      <tr class="${isTop3 ? 'top-rank-row' : ''}">
        <td style="width: 60px;">
          <span class="rank-badge ${rankBadgeClass}">#${idx + 1}</span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            ${avatar}
            <a href="https://sepolia.etherscan.io/address/${item.address}" target="_blank" rel="noopener noreferrer" class="leaderboard-address-link">
              ${shortAddr}
            </a>
          </div>
        </td>
        <td>
          <span class="wallet-lvl-chip">LVL ${item.level}</span>
        </td>
        <td style="font-family:var(--font-mono); font-weight:700; color:var(--text);">
          ${primaryMetric}
        </td>
        <td style="font-family:var(--font-mono); font-weight:800; color:var(--accent-lime); text-align:right;">
          ${item.xp} XP
        </td>
      </tr>
    `;
  }).join('');

  tableContainer.innerHTML = rowsHtml;
}

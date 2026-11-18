/**
 * MULTIPOLL • js/dashboard.js
 * User Activity Dashboard: Created Polls (with Creator Controls), Voted Polls, Stats Overview
 * Subscribes to single source of truth wallet.js
 */

import { injectLayout } from './layout.js';
import {
  fetchAllPolls,
  createPollCardHtml,
  executeCancelPoll,
  executeEndPollEarly,
  executeArchivePoll,
  executeUnarchivePoll
} from './polls-service.js';
import * as wallet from './wallet.js';
import { createIdenticonSvg, hidePollForMe, showToast, areAddressesEqual } from './ui.js';

let activeTab = 'created'; // 'created' | 'voted'
let allPollsCache = [];
let showArchived = false;
let dashboardError = null;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in dashboard.js:', e); }
  try { setupGlobalCardActionHandler(); } catch (e) { console.error('setupGlobalCardActionHandler failed:', e); }
  try { bindDashboardEvents(); } catch (e) { console.error('bindDashboardEvents failed:', e); }

  // Initial skeleton state while awaiting wallet.ready
  renderDashboardSkeleton();

  await wallet.ready;

  // Subscribe to wallet state changes
  wallet.subscribe(async (walletState) => {
    try {
      if (walletState.status === 'pending') {
        renderDashboardSkeleton();
      } else if (walletState.status === 'connected' && walletState.address) {
        updateUserSummaryHeader(walletState.address);
        await loadUserDashboard();
      } else if (walletState.status === 'wrong_network') {
        renderWrongNetworkPrompt();
      } else {
        renderConnectPrompt();
      }
    } catch (err) {
      console.error('Wallet state handling error in dashboard:', err);
    }
  });
});

function bindDashboardEvents() {
  const tabCreated = document.getElementById('dashTabCreated');
  const tabVoted = document.getElementById('dashTabVoted');
  const archivedCheckbox = document.getElementById('dashShowArchived');

  if (tabCreated) {
    tabCreated.addEventListener('click', () => {
      tabCreated.classList.add('active');
      if (tabVoted) tabVoted.classList.remove('active');
      activeTab = 'created';
      renderDashboardGrid();
    });
  }

  if (tabVoted) {
    tabVoted.addEventListener('click', () => {
      tabVoted.classList.add('active');
      if (tabCreated) tabCreated.classList.remove('active');
      activeTab = 'voted';
      renderDashboardGrid();
    });
  }

  if (archivedCheckbox) {
    archivedCheckbox.addEventListener('change', (e) => {
      showArchived = e.target.checked;
      renderDashboardGrid();
    });
  }
}

async function loadUserDashboard() {
  const userAddr = wallet.state.address;
  if (!userAddr) {
    renderConnectPrompt();
    return;
  }

  updateUserSummaryHeader(userAddr);

  const grid = document.getElementById('dashPollsGrid');
  if (grid) {
    renderSkeletons(grid, 4);
  }

  try {
    allPollsCache = await fetchAllPolls();
    dashboardError = null;
  } catch (err) {
    dashboardError = err;
    console.error('Error loading dashboard polls:', err);
  }

  renderDashboardGrid();
}

function updateUserSummaryHeader(userAddr) {
  const headerContainer = document.getElementById('dashUserHeader');
  if (!headerContainer) return;

  headerContainer.innerHTML = `
    <div class="dash-user-left">
      ${createIdenticonSvg(userAddr, 52)}
      <div>
        <div style="font-size: 0.75rem; color: var(--accent-orange); font-family: var(--font-mono); font-weight: 700; text-transform: uppercase;">
          Connected Wallet
        </div>
        <div class="dash-user-address">${userAddr}</div>
      </div>
    </div>
  `;
}

function renderDashboardGrid() {
  const grid = document.getElementById('dashPollsGrid');
  const statCreatedEl = document.getElementById('dashStatCreated');
  const statVotedEl = document.getElementById('dashStatVoted');
  if (!grid) return;

  if (dashboardError) {
    grid.innerHTML = `
      <div class="empty-state error-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/squiggle.svg" alt="Error" class="empty-state-sticker" />
        <h3 class="empty-state-title">Could not load data from the network</h3>
        <p class="empty-state-desc">${escapeHtml(dashboardError.message || 'Sepolia RPC communication failed')}</p>
        <button type="button" class="btn-primary" id="dashRetryBtn">Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById('dashRetryBtn');
    if (retryBtn) retryBtn.onclick = () => loadUserDashboard();
    return;
  }

  const userAccount = wallet.state.address;

  // Filter polls created by user
  const createdPolls = allPollsCache.filter(p => areAddressesEqual(p.creator, userAccount));
  // Filter polls user voted on
  const votedPolls = allPollsCache.filter(p => Boolean(p.userHasVoted));

  if (statCreatedEl) statCreatedEl.textContent = createdPolls.length;
  if (statVotedEl) statVotedEl.textContent = votedPolls.length;

  let currentList = activeTab === 'created' ? createdPolls : votedPolls;

  // Filter archived
  if (!showArchived) {
    currentList = currentList.filter(p => !p.archived);
  }

  if (currentList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/smiley.svg" alt="Smiley" class="empty-state-sticker" />
        <h3 class="empty-state-title">
          ${activeTab === 'created' ? 'No Polls Created Yet' : 'No Votes Recorded'}
        </h3>
        <p class="empty-state-desc">
          ${activeTab === 'created'
            ? 'You have not deployed any polls from this wallet address yet.'
            : 'You have not cast any on-chain votes from this wallet address.'}
        </p>
        <a href="${activeTab === 'created' ? 'create.html' : 'polls.html'}" class="btn-primary">
          ${activeTab === 'created' ? 'Launch Your First Poll' : 'Explore Community Polls'}
        </a>
      </div>
    `;
    return;
  }

  grid.innerHTML = currentList.map(p => createPollCardHtml(p)).join('');
}

function renderDashboardSkeleton() {
  const headerContainer = document.getElementById('dashUserHeader');
  if (headerContainer) {
    headerContainer.innerHTML = `
      <div class="dash-user-left">
        <div class="skeleton-line" style="width: 52px; height: 52px; border-radius: 50%;"></div>
        <div>
          <div class="skeleton-line" style="width: 120px; height: 16px; margin-bottom: 8px;"></div>
          <div class="skeleton-line" style="width: 240px; height: 20px;"></div>
        </div>
      </div>
    `;
  }
  const grid = document.getElementById('dashPollsGrid');
  if (grid) {
    renderSkeletons(grid, 4);
  }
}

function renderSkeletons(container, count = 4) {
  let skeletonsHtml = '';
  for (let i = 0; i < count; i++) {
    skeletonsHtml += `
      <div class="skeleton-card">
        <div class="skeleton-line" style="width: 45%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 80%; height: 24px; margin-top: 10px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 16px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 48px; margin-top: 16px;"></div>
      </div>
    `;
  }
  container.innerHTML = skeletonsHtml;
}

function renderConnectPrompt() {
  const grid = document.getElementById('dashPollsGrid');
  const headerContainer = document.getElementById('dashUserHeader');

  if (headerContainer) {
    headerContainer.innerHTML = `
      <div style="font-size: 1rem; color: var(--text-muted);">
        Please connect your Web3 wallet to inspect your on-chain creations and vote history.
      </div>
    `;
  }

  if (grid) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/star.svg" alt="Star" class="empty-state-sticker" />
        <h3 class="empty-state-title">Connect Wallet Required</h3>
        <p class="empty-state-desc">Your dashboard displays your unique deployed ballots and personal voting history on Ethereum Sepolia.</p>
        <button type="button" class="btn-primary" id="btnDashConnectPrompt">
          <span>Connect Wallet</span>
        </button>
      </div>
    `;

    const btn = document.getElementById('btnDashConnectPrompt');
    if (btn) {
      btn.onclick = async () => {
        try {
          await wallet.connect();
        } catch (e) {
          showToast(e.message || 'Connection failed', 'error');
        }
      };
    }
  }
}

function renderWrongNetworkPrompt() {
  const grid = document.getElementById('dashPollsGrid');
  const headerContainer = document.getElementById('dashUserHeader');

  if (headerContainer) {
    headerContainer.innerHTML = `
      <div style="font-size: 1rem; color: var(--accent-red);">
        Connected to wrong network. Please switch to Ethereum Sepolia.
      </div>
    `;
  }

  if (grid) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/squiggle.svg" alt="Network" class="empty-state-sticker" />
        <h3 class="empty-state-title">Switch to Sepolia Network</h3>
        <p class="empty-state-desc">VOICE is deployed on Ethereum Sepolia (Chain ID 11155111). Switch your wallet to continue.</p>
        <button type="button" class="btn-primary" id="btnDashSwitchPrompt">
          <span>Switch to Sepolia</span>
        </button>
      </div>
    `;

    const btn = document.getElementById('btnDashSwitchPrompt');
    if (btn) {
      btn.onclick = async () => {
        try {
          await wallet.switchToSepolia();
        } catch (e) {
          showToast(e.message || 'Network switch failed', 'error');
        }
      };
    }
  }
}

function setupGlobalCardActionHandler() {
  window.handlePollCardAction = async (action, pollId) => {
    if (action === 'endEarly') {
      await executeEndPollEarly(pollId, async () => {
        await loadUserDashboard();
      });
    } else if (action === 'cancel') {
      await executeCancelPoll(pollId, async () => {
        await loadUserDashboard();
      });
    } else if (action === 'archive') {
      await executeArchivePoll(pollId, async () => {
        await loadUserDashboard();
      });
    } else if (action === 'unarchive') {
      await executeUnarchivePoll(pollId, async () => {
        await loadUserDashboard();
      });
    } else if (action === 'hideForMe') {
      hidePollForMe(pollId);
      showToast(`Poll #${pollId} hidden from your view.`, 'info');
      renderDashboardGrid();
    }
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

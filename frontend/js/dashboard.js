/**
 * MULTIPOLL • js/dashboard.js
 * User Activity Dashboard: Created Polls (with Creator Controls), Voted Polls, Stats Overview
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
import { getCurrentAccount, isWalletConnected, connectWallet } from './web3.js';
import { createIdenticonSvg, shortenAddress, hidePollForMe, showToast, areAddressesEqual } from './ui.js';

let activeTab = 'created'; // 'created' | 'voted'
let allPollsCache = [];
let showArchived = false;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in dashboard.js:', e); }
  try { setupGlobalCardActionHandler(); } catch (e) { console.error('setupGlobalCardActionHandler failed:', e); }
  try { bindDashboardEvents(); } catch (e) { console.error('bindDashboardEvents failed:', e); }

  try {
    if (!isWalletConnected()) {
      renderConnectPrompt();
    } else {
      await loadUserDashboard();
    }
  } catch (err) {
    console.error('loadUserDashboard failed:', err);
  }

  // Handle wallet connection changes
  window.addEventListener('walletStateChanged', async (e) => {
    try {
      if (e.detail.connected) {
        await loadUserDashboard();
      } else {
        renderConnectPrompt();
      }
    } catch (err) {
      console.error('walletStateChanged handler failed in dashboard.js:', err);
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
  const userAddr = getCurrentAccount();
  if (!userAddr) {
    renderConnectPrompt();
    return;
  }

  updateUserSummaryHeader(userAddr);
  allPollsCache = await fetchAllPolls();
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

  const userAccount = getCurrentAccount();

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
          <span>Connect MetaMask</span>
        </button>
      </div>
    `;

    const btn = document.getElementById('btnDashConnectPrompt');
    if (btn) {
      btn.onclick = async () => {
        await connectWallet();
      };
    }
  }
}

function setupGlobalCardActionHandler() {
  window.handlePollCardAction = async (action, pollId) => {
    if (action === 'endEarly') {
      await executeEndPollEarly(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        renderDashboardGrid();
      });
    } else if (action === 'cancel') {
      await executeCancelPoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        renderDashboardGrid();
      });
    } else if (action === 'archive') {
      await executeArchivePoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        renderDashboardGrid();
      });
    } else if (action === 'unarchive') {
      await executeUnarchivePoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        renderDashboardGrid();
      });
    } else if (action === 'hideForMe') {
      hidePollForMe(pollId);
      showToast(`Poll #${pollId} hidden from your view.`, 'info');
      renderDashboardGrid();
    }
  };
}

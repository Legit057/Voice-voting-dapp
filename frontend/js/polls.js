/**
 * MULTIPOLL • js/polls.js
 * Browse All Polls Page: Filtering, Searching, Sorting, Show Archived Toggle, Dashed Create Card
 * Unified resilient states: Loading Skeleton, Error State with Retry, Empty State
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
import { isPollHidden, hidePollForMe, showToast } from './ui.js';

let allPollsCache = [];
let currentTab = 'all'; // 'all' | 'active' | 'ended'
let currentSearch = '';
let currentSort = 'newest'; // 'newest' | 'oldest' | 'votes' | 'ending-soon'
let showArchived = false;
let fetchError = null;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (err) { console.error('injectLayout failed in polls.js:', err); }
  try { setupGlobalCardActionHandler(); } catch (err) { console.error('setupGlobalCardActionHandler failed:', err); }
  try { bindToolbarEvents(); } catch (err) { console.error('bindToolbarEvents failed:', err); }

  // Initial load
  await loadAndRenderPolls();

  // Re-render when wallet state changes (e.g. to update user vote highlights)
  wallet.subscribe(() => {
    try { applyFilterAndRender(); } catch (err) { console.error('applyFilterAndRender failed on wallet change:', err); }
  });
});

function bindToolbarEvents() {
  const tabBtns = document.querySelectorAll('.filter-tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      applyFilterAndRender();
    });
  });

  const searchInput = document.getElementById('pollsSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim().toLowerCase();
      applyFilterAndRender();
    });
  }

  const sortSelect = document.getElementById('pollsSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFilterAndRender();
    });
  }

  const archivedToggle = document.getElementById('showArchivedCheckbox');
  if (archivedToggle) {
    archivedToggle.addEventListener('change', (e) => {
      showArchived = e.target.checked;
      applyFilterAndRender();
    });
  }
}

async function loadAndRenderPolls() {
  const gridContainer = document.getElementById('pollsGrid');
  if (!gridContainer) return;

  renderSkeletons(gridContainer, 6);

  try {
    allPollsCache = await fetchAllPolls();
    fetchError = null;
  } catch (err) {
    console.error('loadAndRenderPolls error:', err);
    fetchError = err;
  }

  applyFilterAndRender();
}

function applyFilterAndRender() {
  const gridContainer = document.getElementById('pollsGrid');
  if (!gridContainer) return;

  // 1. Error state
  if (fetchError) {
    gridContainer.innerHTML = `
      <div class="empty-state error-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/squiggle.svg" alt="Error" class="empty-state-sticker" />
        <h3 class="empty-state-title">Could not load data from the network</h3>
        <p class="empty-state-desc">${escapeHtml(fetchError.message || 'Sepolia RPC node did not respond')}</p>
        <button type="button" class="btn-primary btn-retry" id="pollsRetryBtn">
          <span>Retry</span>
        </button>
      </div>
    `;
    const retryBtn = document.getElementById('pollsRetryBtn');
    if (retryBtn) retryBtn.onclick = () => loadAndRenderPolls();
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  // 2. Filter out user-hidden polls
  let list = allPollsCache.filter(p => !isPollHidden(p.id));

  // 3. Filter by Archived state
  if (!showArchived) {
    list = list.filter(p => !p.archived);
  }

  // 4. Filter by Tab
  if (currentTab === 'active') {
    list = list.filter(p => !p.isCancelled && p.endTime > now && !p.archived);
  } else if (currentTab === 'ended') {
    list = list.filter(p => p.isCancelled || p.endTime <= now);
  }

  // 5. Search Filter
  if (currentSearch) {
    list = list.filter(p =>
      p.title.toLowerCase().includes(currentSearch) ||
      p.description.toLowerCase().includes(currentSearch) ||
      p.options.some(opt => opt.name.toLowerCase().includes(currentSearch))
    );
  }

  // 6. Sort
  list.sort((a, b) => {
    if (currentSort === 'newest') return b.id - a.id;
    if (currentSort === 'oldest') return a.id - b.id;
    if (currentSort === 'votes') return b.totalVotes - a.totalVotes || b.id - a.id;
    if (currentSort === 'ending-soon') {
      const aLeft = a.endTime - now;
      const bLeft = b.endTime - now;
      if (aLeft <= 0 && bLeft > 0) return 1;
      if (bLeft <= 0 && aLeft > 0) return -1;
      return aLeft - bLeft;
    }
    return b.id - a.id;
  });

  // Render Poll Cards
  const cardsHtml = list.map(p => createPollCardHtml(p)).join('');

  // Dashed "Create Your Poll" Card at the end of the grid
  const dashedCreateCardHtml = `
    <div class="poll-card-create-prompt" onclick="window.location.href='create.html'" role="button" tabindex="0" aria-label="Create a new poll">
      <div class="create-prompt-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <h3 class="create-prompt-title">LAUNCH A POLL</h3>
      <p class="create-prompt-desc">Have a question for the community? Deploy your ballot on Sepolia in seconds.</p>
    </div>
  `;

  // 7. Empty state only when read succeeded and zero polls match
  if (list.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <img src="assets/stickers/smiley.svg" alt="Smiley" class="empty-state-sticker" />
        <h3 class="empty-state-title">No Polls Found</h3>
        <p class="empty-state-desc">Try clearing your search query or switching tabs to see more ballots.</p>
        <a href="create.html" class="btn-primary">Create a New Poll</a>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = cardsHtml + dashedCreateCardHtml;
}

function renderSkeletons(container, count = 6) {
  let skeletonsHtml = '';
  for (let i = 0; i < count; i++) {
    skeletonsHtml += `
      <div class="skeleton-card">
        <div class="skeleton-line" style="width: 45%; height: 28px;"></div>
        <div class="skeleton-line" style="width: 80%; height: 24px; margin-top: 10px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 16px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 48px; margin-top: 16px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 48px;"></div>
        <div class="skeleton-line" style="width: 100%; height: 48px;"></div>
      </div>
    `;
  }
  container.innerHTML = skeletonsHtml;
}

function setupGlobalCardActionHandler() {
  window.handlePollCardAction = async (action, pollId) => {
    if (action === 'endEarly') {
      await executeEndPollEarly(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        applyFilterAndRender();
      });
    } else if (action === 'cancel') {
      await executeCancelPoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        applyFilterAndRender();
      });
    } else if (action === 'archive') {
      await executeArchivePoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        applyFilterAndRender();
      });
    } else if (action === 'unarchive') {
      await executeUnarchivePoll(pollId, async () => {
        allPollsCache = await fetchAllPolls();
        applyFilterAndRender();
      });
    } else if (action === 'hideForMe') {
      hidePollForMe(pollId);
      showToast(`Poll #${pollId} hidden from your view.`, 'info');
      applyFilterAndRender();
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

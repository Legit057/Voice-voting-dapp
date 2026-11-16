/**
 * MULTIPOLL • js/polls-service.js
 * Centralized Data Layer for Poll Queries, Voting, Archiving, and Card Rendering
 */

import { getReadContract, getWriteContract, getCurrentAccount, checkAndSwitchNetwork, isWalletConnected, connectWallet } from './web3.js';
import {
  createIdenticonSvg,
  shortenAddress,
  formatTimeRemaining,
  formatTimeLeft,
  areAddressesEqual,
  guardString,
  confirmDialog,
  showToast,
  parseContractError,
  fireConfetti,
  showVoteReceiptModal,
  isPollHidden,
  hidePollForMe
} from './ui.js';

/* --------------------------------------------------------------------------
   1. Fetch Polls & Options (Read-Only Safe)
   -------------------------------------------------------------------------- */
export async function fetchAllPolls() {
  const contract = getReadContract();
  if (!contract) return [];

  try {
    const rawPolls = await contract.getAllPolls();
    if (!rawPolls || rawPolls.length === 0) return [];

    const userAccount = getCurrentAccount();
    const formatted = [];

    for (let i = 0; i < rawPolls.length; i++) {
      const p = rawPolls[i];
      if (!p.exists) continue;

      const pollId = Number(p.id);
      let options = [];

      try {
        const rawOpts = await contract.getPollOptions(pollId);
        options = rawOpts.map((opt) => ({
          id: Number(opt.id),
          name: opt.name,
          voteCount: Number(opt.voteCount)
        }));
      } catch (optErr) {
        console.warn(`Failed to fetch options for poll #${pollId}:`, optErr);
      }

      // Check if current user voted
      let userHasVoted = false;
      let userChoice = null;

      if (userAccount) {
        try {
          userHasVoted = await contract.hasVoted(pollId, userAccount);
          if (userHasVoted) {
            userChoice = Number(await contract.getVoterChoice(pollId, userAccount));
          }
        } catch (e) {
          // ignore
        }
      }

      formatted.push({
        id: pollId,
        title: p.title,
        description: p.description,
        creator: p.creator,
        endTime: Number(p.endTime),
        totalVotes: Number(p.totalVotes),
        isBlind: Boolean(p.isBlind),
        isCancelled: Boolean(p.isCancelled),
        archived: Boolean(p.archived),
        options,
        userHasVoted,
        userChoice
      });
    }

    return formatted;
  } catch (err) {
    console.error('Error fetching all polls:', err);
    return [];
  }
}

export async function fetchPollById(pollId) {
  const contract = getReadContract();
  if (!contract) return null;

  try {
    const p = await contract.getPoll(pollId);
    if (!p || !p.exists) return null;

    const rawOpts = await contract.getPollOptions(pollId);
    const options = rawOpts.map((opt) => ({
      id: Number(opt.id),
      name: opt.name,
      voteCount: Number(opt.voteCount)
    }));

    const userAccount = getCurrentAccount();
    let userHasVoted = false;
    let userChoice = null;

    if (userAccount) {
      try {
        userHasVoted = await contract.hasVoted(pollId, userAccount);
        if (userHasVoted) {
          userChoice = Number(await contract.getVoterChoice(pollId, userAccount));
        }
      } catch (e) {
        // ignore
      }
    }

    return {
      id: Number(p.id),
      title: p.title,
      description: p.description,
      creator: p.creator,
      endTime: Number(p.endTime),
      totalVotes: Number(p.totalVotes),
      isBlind: Boolean(p.isBlind),
      isCancelled: Boolean(p.isCancelled),
      archived: Boolean(p.archived),
      options,
      userHasVoted,
      userChoice
    };
  } catch (err) {
    console.error(`Error fetching poll #${pollId}:`, err);
    return null;
  }
}

/* --------------------------------------------------------------------------
   2. Contract Mutating Actions: Vote, Cancel, End Early, Archive, Unarchive
   -------------------------------------------------------------------------- */
export async function executeVote(pollId, optionId, meta = {}, onSuccess = () => {}) {
  // Support either (pollId, optionId, onSuccess) or (pollId, optionId, meta, onSuccess)
  let callback = onSuccess;
  let details = meta;
  if (typeof meta === 'function') {
    callback = meta;
    details = {};
  }

  if (!isWalletConnected()) {
    const connected = await connectWallet();
    if (!connected) return;
  }

  const isNetworkOk = await checkAndSwitchNetwork();
  if (!isNetworkOk) return;

  try {
    showToast('Submitting vote to Ethereum Sepolia...', 'info');
    const contract = await getWriteContract();
    const tx = await contract.vote(pollId, optionId);
    showToast('Vote transaction broadcast. Waiting for confirmation...', 'info', tx.hash);

    const receipt = await tx.wait();
    fireConfetti();
    showToast('Vote confirmed on Sepolia!', 'success', receipt.hash);

    // Update user XP (+10 XP)
    const userAddr = getCurrentAccount();
    if (userAddr) {
      const clean = userAddr.toLowerCase();
      const curXp = Number(localStorage.getItem(`multipoll_xp_${clean}`)) || 0;
      localStorage.setItem(`multipoll_xp_${clean}`, curXp + 10);
    }

    // Resolve poll title and option name if missing
    let pTitle = details.pollTitle;
    let optName = details.optionName;
    if (!pTitle || !optName) {
      try {
        const readContract = getReadContract();
        const p = await readContract.getPoll(pollId);
        if (p) pTitle = p.title;
        const opts = await readContract.getPollOptions(pollId);
        const match = opts.find(o => Number(o.id) === Number(optionId));
        if (match) optName = match.name;
      } catch (e) {
        console.warn('Could not fetch poll details for receipt:', e);
      }
    }

    // Show Official Vote Receipt Modal
    showVoteReceiptModal({
      pollTitle: pTitle || `Poll #${pollId}`,
      optionName: optName || `Option #${optionId}`,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      voterAddress: userAddr,
      pollId
    });

    callback();
  } catch (err) {
    console.error('Vote failed:', err);
    showToast(parseContractError(err), 'error');
  }
}

export async function executeCancelPoll(pollId, onSuccess = () => {}) {
  confirmDialog({
    title: 'Cancel Poll',
    message: 'Are you sure you want to cancel this poll? This action cannot be undone, and will only succeed if zero votes have been cast.',
    confirmText: 'Cancel Poll',
    confirmClass: 'btn-primary',
    onConfirm: async () => {
      try {
        const contract = await getWriteContract();
        const tx = await contract.cancelPoll(pollId);
        showToast('Cancelling poll...', 'info', tx.hash);
        const receipt = await tx.wait();
        showToast('Poll cancelled successfully.', 'success', receipt.hash);
        onSuccess();
      } catch (err) {
        console.error('Cancel poll error:', err);
        showToast(parseContractError(err), 'error');
      }
    }
  });
}

export async function executeEndPollEarly(pollId, onSuccess = () => {}) {
  confirmDialog({
    title: 'End Poll Early',
    message: 'Ending this poll early will close voting immediately and tally the final results. Are you sure?',
    confirmText: 'End Early',
    confirmClass: 'btn-lime',
    onConfirm: async () => {
      try {
        const contract = await getWriteContract();
        const tx = await contract.endPollEarly(pollId);
        showToast('Ending poll early...', 'info', tx.hash);
        const receipt = await tx.wait();
        showToast('Poll ended early.', 'success', receipt.hash);
        onSuccess();
      } catch (err) {
        console.error('End poll early error:', err);
        showToast(parseContractError(err), 'error');
      }
    }
  });
}

export async function executeArchivePoll(pollId, onSuccess = () => {}) {
  confirmDialog({
    title: 'Delete (Archive) Poll',
    message: 'This hides the poll from lists. The data stays on the blockchain and remains visible on Etherscan.',
    confirmText: 'Delete / Archive',
    confirmClass: 'btn-primary',
    onConfirm: async () => {
      try {
        const contract = await getWriteContract();
        const tx = await contract.archivePoll(pollId);
        showToast('Archiving poll on-chain...', 'info', tx.hash);
        const receipt = await tx.wait();
        showToast('Poll archived (hidden from lists).', 'success', receipt.hash);
        onSuccess();
      } catch (err) {
        console.error('Archive poll error:', err);
        showToast(parseContractError(err), 'error');
      }
    }
  });
}

export async function executeUnarchivePoll(pollId, onSuccess = () => {}) {
  try {
    const contract = await getWriteContract();
    const tx = await contract.unarchivePoll(pollId);
    showToast('Restoring poll on-chain...', 'info', tx.hash);
    const receipt = await tx.wait();
    showToast('Poll restored and visible again.', 'success', receipt.hash);
    onSuccess();
  } catch (err) {
    console.error('Unarchive poll error:', err);
    showToast(parseContractError(err), 'error');
  }
}

/* --------------------------------------------------------------------------
   3. Render Poll Card (Voice VoteFi Style)
   -------------------------------------------------------------------------- */
export function createPollCardHtml(poll, options = {}) {
  const { onCardAction = 'window.handlePollCardAction' } = options;
  const now = Math.floor(Date.now() / 1000);
  const endTimeNum = Number(poll.endTime);
  const isCancelled = Boolean(poll.isCancelled);
  const isEnded = endTimeNum <= now || isCancelled;
  const userAccount = getCurrentAccount();
  const isCreator = areAddressesEqual(poll.creator, userAccount);
  const isBlindActive = Boolean(poll.isBlind) && !isEnded;

  // Determine winning option
  let maxVotes = -1;
  let winnerOptionId = -1;
  let isTie = false;

  if (isEnded && !isBlindActive && poll.totalVotes > 0) {
    for (const opt of poll.options) {
      if (opt.voteCount > maxVotes) {
        maxVotes = opt.voteCount;
        winnerOptionId = opt.id;
        isTie = false;
      } else if (opt.voteCount === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    }
  }

  // Badges (Bug Fix D2: contrast of ENDED tag in both themes, no duplicate "Ended" label)
  const badgesHtml = [];
  if (poll.archived) {
    badgesHtml.push(`<span class="badge badge-archived">Archived</span>`);
  }
  if (poll.isCancelled) {
    badgesHtml.push(`<span class="badge badge-cancelled">Cancelled</span>`);
  } else if (isEnded) {
    badgesHtml.push(`<span class="badge badge-ended">ENDED</span>`);
  } else {
    badgesHtml.push(`<span class="badge badge-active">ACTIVE</span>`);
  }

  if (poll.isBlind) {
    badgesHtml.push(`<span class="badge badge-blind" title="Results hidden until voting ends">Blind</span>`);
  }

  // Countdown timer text
  const timerInfo = formatTimeRemaining(poll.endTime);
  const timerText = poll.isCancelled ? 'Cancelled' : (isEnded ? 'Voting Closed' : timerInfo.text);

  // Options List (Bug Fix D1: 2-line layout, line 1 option name full width word wrapping, line 2 votes/percentage/badges without overlapping)
  const optionsHtml = poll.options.map((opt) => {
    const isUserChoice = poll.userHasVoted && poll.userChoice === opt.id;
    const isWinner = isEnded && !isTie && opt.id === winnerOptionId && maxVotes > 0;
    const percent = poll.totalVotes > 0 && !isBlindActive
      ? ((opt.voteCount / poll.totalVotes) * 100).toFixed(1)
      : '0.0';

    const rowClass = [
      'option-row',
      isUserChoice ? 'voted-by-user' : '',
      isWinner ? 'winner-row' : ''
    ].filter(Boolean).join(' ');

    const votesDisplay = isBlindActive
      ? '<span style="font-style:italic;">Hidden</span>'
      : `<span class="option-votes-val">${opt.voteCount}</span> votes`;

    const percentDisplay = isBlindActive ? '??%' : `${percent}%`;

    return `
      <div class="${rowClass}">
        <!-- Progress Bar Underlay -->
        <div class="option-progress-bg" style="width: ${isBlindActive ? 0 : percent}%;"></div>

        <!-- 2-Line Option Content -->
        <div class="option-content">
          <!-- Line 1: Option Name (full width, normal word wrapping) -->
          <div class="option-line-1">
            <span class="option-name">${escapeHtml(opt.name)}</span>
          </div>

          <!-- Line 2: Meta (Votes, Percent, Badges) -->
          <div class="option-line-2">
            <div class="option-meta-left">
              ${votesDisplay} &bull; <span class="option-percent-val">${percentDisplay}</span>
            </div>
            <div class="option-meta-badges">
              ${isUserChoice ? `<span class="badge-your-vote">Your Vote</span>` : ''}
              ${isWinner ? `<span class="badge-winner-stamp">Winner</span>` : ''}
              ${isTie && isEnded && opt.voteCount === maxVotes && maxVotes > 0 ? `<span class="badge-winner-stamp" style="background:#4C5DFF;color:#FFF;">Tie</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Action Buttons
  const actionButtons = [];

  // Creator Controls
  if (isCreator) {
    if (!isEnded && !poll.isCancelled) {
      actionButtons.push(`
        <button type="button" class="btn-card-action" onclick="${onCardAction}('endEarly', ${poll.id})">
          End Early
        </button>
      `);
    }

    if (!poll.isCancelled && poll.totalVotes === 0 && !isEnded) {
      actionButtons.push(`
        <button type="button" class="btn-card-action danger" onclick="${onCardAction}('cancel', ${poll.id})">
          Cancel
        </button>
      `);
    }

    if (poll.archived) {
      actionButtons.push(`
        <button type="button" class="btn-card-action" onclick="${onCardAction}('unarchive', ${poll.id})">
          Restore
        </button>
      `);
    } else if (isEnded || poll.isCancelled) {
      actionButtons.push(`
        <button type="button" class="btn-card-action danger" title="Hide this ended poll from public lists" onclick="${onCardAction}('archive', ${poll.id})">
          Delete
        </button>
      `);
    }
  } else {
    // "Hide for me" for non-creators (localStorage only)
    actionButtons.push(`
      <button type="button" class="btn-card-action" title="Hide from your local view" onclick="${onCardAction}('hideForMe', ${poll.id})">
        Hide for me
      </button>
    `);
  }

  return guardString(`
    <article class="poll-card" data-poll-id="${poll.id}">
      <!-- Card Header -->
      <div class="card-header">
        <div class="card-creator">
          ${createIdenticonSvg(poll.creator, 28)}
          <div class="creator-meta">
            <span class="creator-address">${shortenAddress(poll.creator)}</span>
            <span class="poll-id-tag">Poll #${poll.id}</span>
          </div>
        </div>
        <div class="card-status-badges">
          ${badgesHtml.join('')}
        </div>
      </div>

      <!-- Card Title & Description -->
      <h3 class="card-title">${escapeHtml(poll.title)}</h3>
      <p class="card-desc">${escapeHtml(poll.description)}</p>

      <!-- Countdown Timer Bar -->
      <div class="card-timer-bar">
        <div class="timer-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="timer-clock ${isEnded ? 'ended' : ''}">${timerText}</span>
        </div>
        <div>
          <span class="total-votes-count">${isBlindActive ? '?' : poll.totalVotes}</span> votes
        </div>
      </div>

      <!-- Options List -->
      <div class="card-options-list">
        ${optionsHtml}
      </div>

      <!-- Card Footer Actions -->
      <div class="card-footer">
        <div class="card-actions-left">
          ${actionButtons.join('')}
        </div>
        <div>
          <a href="poll.html?id=${poll.id}" class="btn-vote-now">
            <span>${isEnded ? 'View Results' : (poll.userHasVoted ? 'View Poll' : 'Vote Now')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </a>
        </div>
      </div>
    </article>
  `);
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

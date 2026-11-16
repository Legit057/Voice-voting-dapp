/**
 * MULTIPOLL • js/poll.js
 * Single Poll Page:
 * - Interactive Voting UI & Vote Receipt
 * - Independent Tally Audit (Event-Log Consensus Checker)
 * - Results Reveal Ceremony (3-2-1 Countdown, Stamp & Confetti)
 * - Donut Chart (Chart.js)
 * - Share Link, QR Code & "I Voted" Share Card (html2canvas)
 */

import { injectLayout } from './layout.js';
import {
  fetchPollById,
  executeVote,
  executeEndPollEarly,
  executeCancelPoll,
  executeArchivePoll,
  executeUnarchivePoll
} from './polls-service.js';
import { getCurrentAccount, isWalletConnected, connectWallet, getReadContract, queryContractEvents, CONTRACT_DEPLOY_BLOCK } from './web3.js';
import {
  createIdenticonSvg,
  shortenAddress,
  formatTimeRemaining,
  formatTimeLeft,
  areAddressesEqual,
  guardString,
  showToast,
  fireConfetti,
  escapeHtml
} from './ui.js';

let currentPoll = null;
let selectedOptionId = null;
let chartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  try { injectLayout(); } catch (err) { console.error('injectLayout failed in poll.js:', err); }

  const urlParams = new URLSearchParams(window.location.search);
  const pollId = urlParams.get('id');

  if (!pollId || isNaN(pollId)) {
    renderNotFound('Invalid or missing Poll ID in URL.');
    return;
  }

  try {
    await loadSinglePoll(Number(pollId), true);
  } catch (err) {
    console.error('loadSinglePoll failed:', err);
  }

  window.addEventListener('walletStateChanged', async () => {
    try { await loadSinglePoll(Number(pollId), false); } catch (e) { console.error('walletStateChanged poll reload failed:', e); }
  });

  window.addEventListener('themeChanged', () => {
    try {
      if (chartInstance && currentPoll) {
        updateChart(currentPoll);
      }
    } catch (e) { console.error('themeChanged chart update failed:', e); }
  });
});

async function loadSinglePoll(pollId, isInitialLoad = true) {
  const mainContainer = document.getElementById('pollDetailContainer');
  if (!mainContainer) return;

  const poll = await fetchPollById(pollId);
  if (!poll) {
    renderNotFound(`Poll #${pollId} does not exist or could not be loaded.`);
    return;
  }

  currentPoll = poll;
  renderPollPage(poll);
  renderQrCode();
  setupShareButton();
  setupAuditButton(poll);
  setupShareCardButton(poll);

  // Results Reveal Ceremony if poll is ended
  const now = Math.floor(Date.now() / 1000);
  const isEnded = poll.endTime <= now || poll.isCancelled;
  if (isInitialLoad && isEnded && !poll.isBlind && poll.totalVotes > 0) {
    triggerRevealCeremony(poll);
  }
}

function renderPollPage(poll) {
  const container = document.getElementById('pollDetailContainer');
  if (!container) return;

  const now = Math.floor(Date.now() / 1000);
  const endTimeNum = Number(poll.endTime);
  const isCancelled = Boolean(poll.isCancelled);
  const isEnded = endTimeNum <= now || isCancelled;
  const isBlindActive = Boolean(poll.isBlind) && !isEnded;
  const isCreator = areAddressesEqual(poll.creator, getCurrentAccount());

  // Determine winner / tie
  let maxVotes = -1;
  let winnerId = -1;
  let isTie = false;

  if (isEnded && !isBlindActive && poll.totalVotes > 0) {
    for (const opt of poll.options) {
      if (opt.voteCount > maxVotes) {
        maxVotes = opt.voteCount;
        winnerId = opt.id;
        isTie = false;
      } else if (opt.voteCount === maxVotes && maxVotes > 0) {
        isTie = true;
      }
    }
  }

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
    badgesHtml.push(`<span class="badge badge-blind" title="Results hidden until voting ends">Blind Voting</span>`);
  }

  const timerInfo = formatTimeRemaining(poll.endTime);
  const timerText = poll.isCancelled ? 'Cancelled' : (isEnded ? 'Voting Closed' : timerInfo.text);
  const canVote = !isEnded && !poll.userHasVoted;

  const optionsHtml = poll.options.map((opt) => {
    const isUserChoice = poll.userHasVoted && poll.userChoice === opt.id;
    const isWinner = isEnded && !isTie && opt.id === winnerId && maxVotes > 0;
    const isTieOption = isTie && isEnded && opt.voteCount === maxVotes && maxVotes > 0;
    const isSelected = selectedOptionId === opt.id;

    const percent = poll.totalVotes > 0 && !isBlindActive
      ? ((opt.voteCount / poll.totalVotes) * 100).toFixed(1)
      : '0.0';

    const rowClasses = [
      'option-row',
      canVote ? 'selectable' : '',
      isSelected ? 'selected' : '',
      isUserChoice ? 'voted-by-user' : '',
      isWinner ? 'winner-row' : ''
    ].filter(Boolean).join(' ');

    const votesDisplay = isBlindActive
      ? '<em>Hidden (Blind)</em>'
      : `<span class="option-votes-val">${opt.voteCount}</span> votes`;

    const percentDisplay = isBlindActive ? '??%' : `${percent}%`;

    return `
      <div class="${rowClasses}" data-option-id="${opt.id}" tabindex="${canVote ? '0' : '-1'}" role="${canVote ? 'radio' : 'group'}" aria-checked="${isSelected}">
        <div class="option-progress-bg" style="width: ${isBlindActive ? 0 : percent}%;"></div>

        <div class="option-content">
          <div class="option-line-1">
            <span class="option-name">${escapeHtml(opt.name)}</span>
          </div>
          <div class="option-line-2">
            <div class="option-meta-left">
              ${votesDisplay} &bull; <span class="option-percent-val">${percentDisplay}</span>
            </div>
            <div class="option-meta-badges">
              ${isUserChoice ? `<span class="badge-your-vote">Your Vote</span>` : ''}
              ${isWinner ? `<span class="badge-winner-stamp">Winner</span>` : ''}
              ${isTieOption ? `<span class="badge-winner-stamp" style="background:#4C5DFF;color:#FFF;">Tie</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Creator Controls
  const creatorActions = [];
  if (isCreator) {
    if (!isEnded && !poll.isCancelled) {
      creatorActions.push(`
        <button type="button" class="btn-secondary" id="btnEndEarly">
          End Poll Early
        </button>
      `);
    }
    if (!poll.isCancelled && poll.totalVotes === 0 && !isEnded) {
      creatorActions.push(`
        <button type="button" class="btn-secondary danger" id="btnCancelPoll">
          Cancel Poll
        </button>
      `);
    }
    if (poll.archived) {
      creatorActions.push(`
        <button type="button" class="btn-primary" id="btnUnarchivePoll">
          Restore Poll
        </button>
      `);
    } else if (isEnded || poll.isCancelled) {
      creatorActions.push(`
        <button type="button" class="btn-secondary danger" id="btnArchivePoll">
          Delete Poll
        </button>
      `);
    }
  }

  container.innerHTML = `
    <!-- Results Ceremony Overlay (Rendered conditionally) -->
    <div id="ceremonyOverlay" class="ceremony-overlay" style="display:none;" role="dialog" aria-modal="true">
      <div class="ceremony-box">
        <div id="ceremonyCountdown" class="ceremony-countdown-num">3</div>
        <h2 id="ceremonyTitle" class="ceremony-title">REVEALING ON-CHAIN CONSENSUS</h2>
        <p id="ceremonyDesc" class="ceremony-desc">Synchronizing verified tallies from Ethereum Sepolia...</p>
        <button type="button" class="btn-secondary" id="btnSkipCeremony" style="margin-top:16px;">
          Skip Ceremony
        </button>
      </div>
    </div>

    <div class="poll-detail-layout">
      <!-- Main Column: Voting Card -->
      <div class="poll-detail-main">
        <div class="card-header" style="margin-bottom: 20px;">
          <div class="card-creator">
            ${createIdenticonSvg(poll.creator, 36)}
            <div class="creator-meta">
              <span class="creator-address" style="font-size: 0.95rem;">${shortenAddress(poll.creator)}</span>
              <span class="poll-id-tag">Created Poll #${poll.id}</span>
            </div>
          </div>
          <div class="card-status-badges">
            ${badgesHtml.join('')}
          </div>
        </div>

        <h1 class="card-title" style="font-size: 2rem; margin-bottom: 12px;">${escapeHtml(poll.title)}</h1>
        <p class="card-desc" style="font-size: 1.05rem; margin-bottom: 24px;">${escapeHtml(poll.description)}</p>

        <!-- Countdown / Total Votes Bar -->
        <div class="card-timer-bar" style="padding: 12px 18px; margin-bottom: 28px;">
          <div class="timer-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="timer-clock ${isEnded ? 'ended' : ''}" style="font-size: 0.95rem;">
              ${timerText}
            </span>
          </div>
          <div style="font-size: 0.95rem;">
            Total Votes: <span class="total-votes-count">${isBlindActive ? '?' : poll.totalVotes}</span>
          </div>
        </div>

        <!-- Options Voting Selector -->
        <div class="card-options-list" id="votingOptionsList">
          ${optionsHtml}
        </div>

        <!-- Cast Vote Button -->
        <div style="margin-top: 24px;">
          ${canVote ? `
            <button type="button" class="btn-primary" id="btnCastVote" style="width: 100%; padding: 14px; font-size: 1.1rem;">
              <span>Submit Vote on Sepolia</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          ` : (poll.userHasVoted ? `
            <div style="padding: 14px; background: rgba(76, 93, 255, 0.1); border: 1px solid rgba(76, 93, 255, 0.3); border-radius: var(--radius-md); text-align: center; font-weight: 700; color: #8C99FF;">
              You have already voted on this poll. Your vote is immutably recorded on-chain.
            </div>
          ` : `
            <div style="padding: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); text-align: center; color: var(--text-muted);">
              Voting has ended for this ballot.
            </div>
          `)}
        </div>

        <!-- Creator Actions -->
        ${creatorActions.length > 0 ? `
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; gap: 12px; flex-wrap: wrap;">
            ${creatorActions.join('')}
          </div>
        ` : ''}
      </div>

      <!-- Right Column: Results Donut Chart, Audit & Share Tools -->
      <div class="poll-sidebar">
        <!-- Results Chart Card -->
        <div class="sidebar-card">
          <div class="sidebar-title">
            <span>Result Breakdown</span>
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">
              ${isBlindActive ? 'Blind Ballot' : 'Real-Time'}
            </span>
          </div>

          <div class="chart-container-wrapper">
            <canvas id="pollResultsChart"></canvas>
            ${isBlindActive ? `
              <div style="position: absolute; text-align: center; padding: 20px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7B6CFF" stroke-width="2" style="margin: 0 auto 8px;">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <div style="font-weight: 700; font-size: 0.9rem;">Tallies Hidden</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Results reveal once timer expires.</div>
              </div>
            ` : (poll.totalVotes === 0 ? `
              <div style="position: absolute; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                No votes cast yet.
              </div>
            ` : '')}
          </div>

          <!-- Independent Tally Audit Trigger -->
          <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
            <button type="button" class="btn-secondary" id="btnAuditTally" style="width: 100%; font-size: 0.85rem;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span>Audit This Result On-Chain</span>
            </button>
            <div id="auditResultArea" style="margin-top: 12px; font-size: 0.82rem; font-family: var(--font-mono);"></div>
          </div>
        </div>

        <!-- Share, Mobile QR & Share Card -->
        <div class="sidebar-card">
          <h3 class="sidebar-title">Share & Mobile Vote</h3>
          <div class="share-card-actions">
            <button type="button" class="btn-secondary" id="btnSharePoll" style="width: 100%;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>Copy Share Link</span>
            </button>

            <!-- Generate I Voted Card Button -->
            <button type="button" class="btn-secondary" id="btnGenerateShareCard" style="width: 100%;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span>Generate "I Voted" Card</span>
            </button>

            <!-- QR Code -->
            <div class="qr-code-wrapper">
              <div id="pollQrCode"></div>
              <span class="qr-caption">Scan with mobile to vote</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind option selection
  if (canVote) {
    const optionRows = container.querySelectorAll('.option-row.selectable');
    optionRows.forEach((row) => {
      row.addEventListener('click', () => {
        optionRows.forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedOptionId = Number(row.dataset.optionId);
      });
    });

    const castVoteBtn = container.querySelector('#btnCastVote');
    if (castVoteBtn) {
      castVoteBtn.addEventListener('click', async () => {
        if (selectedOptionId === null) {
          showToast('Please select an option before voting.', 'error');
          return;
        }

        castVoteBtn.disabled = true;
        castVoteBtn.innerHTML = `<span>Submitting Vote...</span>`;

        const chosenOpt = poll.options.find(o => o.id === selectedOptionId);

        await executeVote(
          poll.id,
          selectedOptionId,
          {
            pollTitle: poll.title,
            optionName: chosenOpt ? chosenOpt.name : `Option #${selectedOptionId}`
          },
          async () => {
            await loadSinglePoll(poll.id, true);
          }
        );

        castVoteBtn.disabled = false;
      });
    }
  }

  // Creator Controls bindings
  const btnEndEarly = container.querySelector('#btnEndEarly');
  if (btnEndEarly) {
    btnEndEarly.onclick = () => executeEndPollEarly(poll.id, () => loadSinglePoll(poll.id, false));
  }

  const btnCancelPoll = container.querySelector('#btnCancelPoll');
  if (btnCancelPoll) {
    btnCancelPoll.onclick = () => executeCancelPoll(poll.id, () => loadSinglePoll(poll.id, false));
  }

  const btnArchivePoll = container.querySelector('#btnArchivePoll');
  if (btnArchivePoll) {
    btnArchivePoll.onclick = () => executeArchivePoll(poll.id, () => loadSinglePoll(poll.id, false));
  }

  const btnUnarchivePoll = container.querySelector('#btnUnarchivePoll');
  if (btnUnarchivePoll) {
    btnUnarchivePoll.onclick = () => executeUnarchivePoll(poll.id, () => loadSinglePoll(poll.id, false));
  }

  updateChart(poll);
}

/* --------------------------------------------------------------------------
   Independent Tally Audit Engine
   -------------------------------------------------------------------------- */
function setupAuditButton(poll) {
  const auditBtn = document.getElementById('btnAuditTally');
  const resultArea = document.getElementById('auditResultArea');
  if (!auditBtn || !resultArea) return;

  auditBtn.addEventListener('click', async () => {
    try {
      auditBtn.disabled = true;
      auditBtn.innerHTML = `<span>Querying Event Logs...</span>`;
      resultArea.innerHTML = `<span style="color:var(--text-muted);">Fetching VoteCast events from block #${CONTRACT_DEPLOY_BLOCK} to latest...</span>`;

      const contract = getReadContract();
      if (!contract) throw new Error('Contract not available');

      const filter = contract.filters.VoteCast(poll.id);
      const events = await queryContractEvents(filter, CONTRACT_DEPLOY_BLOCK);

      // Tally in JS from event logs
      const tallies = {};
      events.forEach((ev) => {
        const optId = Number(ev.args.optionId);
        tallies[optId] = (tallies[optId] || 0) + 1;
      });

      // Compare with stored tallies
      let mismatch = false;
      const breakdown = [];

      poll.options.forEach((opt) => {
        const eventCount = tallies[opt.id] || 0;
        const storedCount = opt.voteCount;
        const matches = eventCount === storedCount;
        if (!matches && !poll.isBlind) {
          mismatch = true;
        }
        breakdown.push(`
          <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-subtle);">
            <span>${escapeHtml(opt.name)}:</span>
            <span>${eventCount} logged (${storedCount} stored)</span>
          </div>
        `);
      });

      if (!mismatch) {
        resultArea.innerHTML = `
          <div style="background:rgba(0,166,81,0.12); border:1px solid rgba(0,166,81,0.4); border-radius:var(--radius-sm); padding:10px; color:#00D26A;">
            <div style="font-weight:700; margin-bottom:4px;">100% Cryptographic Consensus Verified</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
              All ${events.length} VoteCast event logs on Sepolia match the contract state exactly.
            </div>
            ${breakdown.join('')}
          </div>
        `;
      } else {
        resultArea.innerHTML = `
          <div style="background:rgba(239,68,68,0.12); border:1px solid var(--accent-red); border-radius:var(--radius-sm); padding:10px; color:var(--accent-red);">
            <div style="font-weight:700;">Tally Mismatch Detected</div>
            ${breakdown.join('')}
          </div>
        `;
      }
    } catch (err) {
      console.error('Audit failed:', err);
      resultArea.innerHTML = `<span style="color:var(--accent-red);">Audit error: ${escapeHtml(err.message)}</span>`;
    } finally {
      auditBtn.disabled = false;
      auditBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <span>Re-Audit This Result</span>
      `;
    }
  });
}

/* --------------------------------------------------------------------------
   Results Reveal Ceremony (3-2-1 Countdown, Stamp & Confetti)
   -------------------------------------------------------------------------- */
function triggerRevealCeremony(poll) {
  const ceremonyKey = `ceremony_seen_${poll.id}`;
  if (sessionStorage.getItem(ceremonyKey)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const overlay = document.getElementById('ceremonyOverlay');
  const countdownEl = document.getElementById('ceremonyCountdown');
  const titleEl = document.getElementById('ceremonyTitle');
  const descEl = document.getElementById('ceremonyDesc');
  const skipBtn = document.getElementById('btnSkipCeremony');
  if (!overlay || !countdownEl) return;

  overlay.style.display = 'flex';
  sessionStorage.setItem(ceremonyKey, 'true');

  let count = 3;
  let interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = count;
    } else {
      clearInterval(interval);
      countdownEl.textContent = 'REVEALED';
      countdownEl.style.fontSize = '2.4rem';
      if (titleEl) titleEl.textContent = 'CONSENSUS REACHED';
      if (descEl) descEl.textContent = 'Votes decrypted and verified on Ethereum Sepolia!';
      fireConfetti();

      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; overlay.style.opacity = '1'; }, 300);
      }, 1600);
    }
  }, 800);

  if (skipBtn) {
    skipBtn.onclick = () => {
      clearInterval(interval);
      overlay.style.display = 'none';
      fireConfetti();
    };
  }
}

/* --------------------------------------------------------------------------
   Share "I Voted" Card Modal & html2canvas Downloader
   -------------------------------------------------------------------------- */
function setupShareCardButton(poll) {
  const btn = document.getElementById('btnGenerateShareCard');
  if (!btn) return;

  btn.addEventListener('click', () => {
    let overlay = document.getElementById('shareCardModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'shareCardModal';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    const currentAcc = getCurrentAccount() || '0xVoter';
    const chosenOptName = poll.userHasVoted
      ? (poll.options.find(o => o.id === poll.userChoice)?.name || 'Community Choice')
      : 'On-Chain Voter';

    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 500px;" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">SHARE "I VOTED" CARD</h3>
          <button type="button" class="btn-close-modal" id="shareCardModalClose" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body" style="padding: 20px; display:flex; flex-direction:column; align-items:center;">
          <!-- Visual Share Card to be captured -->
          <div id="iVotedCardPreview" style="width: 100%; max-width: 420px; background: #0A0A0A; border: 3px solid #C6FF4D; border-radius: 18px; padding: 24px; color: #FFF8EE; box-shadow: 0 16px 40px rgba(0,0,0,0.8); position: relative; overflow:hidden;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                  <path d="M16 3 L28 10 L16 17 L4 10 Z" fill="#C6FF4D" stroke="#0A0A0A" stroke-width="2.5" stroke-linejoin="round"/>
                  <path d="M4 10 L16 17 L16 29 L4 22 Z" fill="#FF5A1F" stroke="#0A0A0A" stroke-width="2.5" stroke-linejoin="round"/>
                  <path d="M16 17 L28 10 L28 22 L16 29 Z" fill="#D9430F" stroke="#0A0A0A" stroke-width="2.5" stroke-linejoin="round"/>
                  <polyline points="7 19 11 23 15 15" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
                <span style="font-family:'Bebas Neue', sans-serif; font-size:1.4rem; letter-spacing:0.06em; color:#FFF8EE;">MULTIPOLL</span>
              </div>
              <span style="background:rgba(198,255,77,0.2); border:1px solid #C6FF4D; color:#C6FF4D; font-family:'JetBrains Mono', monospace; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:9999px;">
                ETHEREUM SEPOLIA
              </span>
            </div>

            <div style="font-family:'Bebas Neue', sans-serif; font-size:2.4rem; line-height:0.95; color:#FF5A1F; margin-bottom:12px;">
              I VOTED ON-CHAIN
            </div>

            <p style="font-size:0.95rem; font-weight:700; color:#FFF8EE; line-height:1.35; margin-bottom:14px;">
              "${escapeHtml(poll.title)}"
            </p>

            <div style="background:#141414; border:1px solid #333; border-radius:12px; padding:12px; margin-bottom:16px;">
              <span style="font-size:0.68rem; font-family:'JetBrains Mono', monospace; color:#A3A3A3; text-transform:uppercase;">My Vote Choice</span>
              <div style="font-size:1.15rem; font-weight:800; color:#C6FF4D; margin-top:2px;">
                ${escapeHtml(chosenOptName)}
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #222; padding-top:12px; font-family:'JetBrains Mono', monospace; font-size:0.72rem; color:#A3A3A3;">
              <span>Voter: ${shortenAddress(currentAcc)}</span>
              <span>Poll #${poll.id}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-primary" id="btnDownloadCardPng" style="width:100%;">
            <span>Download Share Card (PNG)</span>
          </button>
        </div>
      </div>
    `;

    overlay.classList.add('open');
    document.body.classList.add('modal-open');

    const closeModal = () => {
      overlay.classList.remove('open');
      document.body.classList.remove('modal-open');
    };

    overlay.querySelector('#shareCardModalClose').onclick = closeModal;

    overlay.querySelector('#btnDownloadCardPng').onclick = async () => {
      const cardEl = document.getElementById('iVotedCardPreview');
      if (!cardEl) return;

      if (typeof window.html2canvas === 'function') {
        try {
          showToast('Generating high-res card image...', 'info');
          const canvas = await window.html2canvas(cardEl, { scale: 2, backgroundColor: '#0A0A0A' });
          const link = document.createElement('a');
          link.download = `i-voted-poll-${poll.id}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          showToast('Share card downloaded successfully!', 'success');
        } catch (e) {
          console.error(e);
          showToast('Failed to export canvas image.', 'error');
        }
      } else {
        showToast('html2canvas library loading, please try again.', 'error');
      }
    };
  });
}

/* --------------------------------------------------------------------------
   Chart.js Donut Chart
   -------------------------------------------------------------------------- */
function updateChart(poll) {
  const canvas = document.getElementById('pollResultsChart');
  if (!canvas || !window.Chart) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const now = Math.floor(Date.now() / 1000);
  const isEnded = poll.endTime <= now || poll.isCancelled;
  const isBlindActive = poll.isBlind && !isEnded;

  if (isBlindActive || poll.totalVotes === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';

  const labels = poll.options.map(o => o.name);
  const data = poll.options.map(o => o.voteCount);
  const palette = [
    '#C6FF4D', '#FF5A1F', '#4C5DFF', '#FFC20E', '#00A651',
    '#7B6CFF', '#06B6D4', '#EC4899', '#F97316', '#10B981'
  ];

  const ctx = canvas.getContext('2d');
  chartInstance = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: palette.slice(0, data.length),
        borderColor: '#141414',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { family: 'Plus Jakarta Sans', size: 12 },
            color: document.documentElement.getAttribute('data-theme') === 'light' ? '#0A0A0A' : '#FFF8EE'
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} votes (${((ctx.raw / poll.totalVotes) * 100).toFixed(1)}%)`
          }
        }
      },
      cutout: '65%'
    }
  });
}

function renderQrCode() {
  const qrContainer = document.getElementById('pollQrCode');
  if (!qrContainer) return;

  qrContainer.innerHTML = '';
  if (typeof window.QRCode === 'function') {
    new window.QRCode(qrContainer, {
      text: window.location.href,
      width: 140,
      height: 140,
      colorDark: '#0A0A0A',
      colorLight: '#FFFFFF',
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }
}

function setupShareButton() {
  const shareBtn = document.getElementById('btnSharePoll');
  if (!shareBtn) return;

  shareBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Poll link copied to clipboard!', 'success');
  };
}

function renderNotFound(message) {
  const container = document.getElementById('pollDetailContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <img src="assets/stickers/smiley.svg" alt="Meme Sticker" class="empty-state-sticker" />
      <h2 class="empty-state-title">Poll Not Found</h2>
      <p class="empty-state-desc">${escapeHtml(message)}</p>
      <a href="polls.html" class="btn-primary" style="margin-top: 16px;">
        Browse All Polls
      </a>
    </div>
  `;
}

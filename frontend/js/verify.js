/**
 * MULTIPOLL • js/verify.js
 * Cryptographic Vote Verifier: Decodes on-chain VoteCast events from any transaction hash
 */

import { injectLayout } from './layout.js';
import { getReadProvider, getReadContract, getTransactionReceipt } from './web3.js';
import { CONTRACT_ADDRESS } from '../contract-config.js';
import { createIdenticonSvg, shortenAddress, escapeHtml, showToast } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in verify.js:', e); }
  try { initVerifier(); } catch (e) { console.error('initVerifier failed:', e); }

  // Check URL query param ?tx=...
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const txParam = urlParams.get('tx');
    if (txParam) {
      const input = document.getElementById('verifyTxInput');
      if (input) {
        input.value = txParam.trim();
        executeVerification(txParam.trim());
      }
    }
  } catch (e) {
    console.error('URL param verify init failed:', e);
  }
});

function initVerifier() {
  const form = document.getElementById('verifyForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = document.getElementById('verifyTxInput')?.value.trim();
    if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
      showToast('Please enter a valid 66-character Ethereum transaction hash (starting with 0x).', 'error');
      return;
    }
    await executeVerification(hash);
  });
}

async function executeVerification(txHash) {
  const resultContainer = document.getElementById('verifyResultArea');
  const verifyBtn = document.getElementById('btnSubmitVerify');
  if (!resultContainer) return;

  try {
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.innerHTML = `<span>Verifying On-Chain...</span>`;
    }

    resultContainer.innerHTML = `
      <div style="text-align:center; padding:36px; color:var(--text-muted);">
        <div class="status-dot" style="margin: 0 auto 12px; background:var(--accent-lime); width:12px; height:12px;"></div>
        Querying transaction receipt and EVM log topics on Ethereum Sepolia...
      </div>
    `;

    const provider = getReadProvider();
    const contract = getReadContract();
    if (!provider || !contract) {
      throw new Error('Ethers provider not initialized.');
    }

    const receipt = await getTransactionReceipt(txHash);
    if (!receipt) {
      resultContainer.innerHTML = `
        <div class="empty-state" style="border-color:var(--accent-red); padding:32px;">
          <h3 style="color:var(--accent-red); font-size:1.3rem;">Transaction Not Found</h3>
          <p class="empty-state-desc">
            No receipt was found for this hash on Sepolia. The transaction might still be pending in the mempool or does not exist.
          </p>
        </div>
      `;
      return;
    }

    if (receipt.status !== 1) {
      resultContainer.innerHTML = `
        <div class="empty-state" style="border-color:var(--accent-red); padding:32px;">
          <h3 style="color:var(--accent-red); font-size:1.3rem;">Transaction Reverted</h3>
          <p class="empty-state-desc">
            This transaction was mined at block #${receipt.blockNumber} but execution failed/reverted on-chain.
          </p>
        </div>
      `;
      return;
    }

    // Parse logs for VoteCast event from our contract
    const iface = contract.interface;
    let voteLog = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()) {
        try {
          const parsed = iface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
          if (parsed && parsed.name === 'VoteCast') {
            voteLog = parsed;
            break;
          }
        } catch (e) {
          // not this event
        }
      }
    }

    if (!voteLog) {
      resultContainer.innerHTML = `
        <div class="empty-state" style="border-color:var(--accent-orange); padding:32px;">
          <h3 style="color:var(--accent-orange); font-size:1.3rem;">No VoteCast Event Found</h3>
          <p class="empty-state-desc">
            This transaction was executed successfully, but does not contain a verified <code>VoteCast</code> event from MultiPoll contract <code>${shortenAddress(CONTRACT_ADDRESS)}</code>.
          </p>
        </div>
      `;
      return;
    }

    // Extract decoded parameters
    const pollId = Number(voteLog.args.pollId);
    const voter = voteLog.args.voter;
    const optionId = Number(voteLog.args.optionId);

    // Fetch poll and options info
    let pollTitle = `Poll #${pollId}`;
    let optionName = `Option #${optionId}`;

    try {
      const poll = await contract.getPoll(pollId);
      if (poll && poll.title) pollTitle = poll.title;

      const options = await contract.getPollOptions(pollId);
      const matchOpt = options.find(o => Number(o.id) === optionId);
      if (matchOpt) optionName = matchOpt.name;
    } catch (e) {
      console.warn('Failed to fetch detailed poll title for verified vote:', e);
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const blockTime = block ? new Date(block.timestamp * 1000).toUTCString() : 'N/A';

    resultContainer.innerHTML = `
      <div class="sidebar-card" style="border-color:#00D26A; border-width:2px; animation:fadeIn 0.3s ease;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
          <span class="verified-badge" style="font-size:0.8rem; padding:4px 12px;">
            CRYPTOGRAPHICALLY VERIFIED
          </span>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">
            Block #${receipt.blockNumber}
          </span>
        </div>

        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-muted); text-transform:uppercase;">
            Ballot Question
          </div>
          <h3 style="font-size:1.4rem; font-weight:800; color:var(--text); margin-top:4px;">
            ${escapeHtml(pollTitle)}
          </h3>
        </div>

        <div style="background:var(--surface); border:1.5px solid var(--accent-lime); border-radius:var(--radius-md); padding:16px; margin-bottom:20px;">
          <div style="font-size:0.72rem; font-family:var(--font-mono); color:var(--accent-lime); font-weight:700; text-transform:uppercase;">
            Verified Voted Option
          </div>
          <div style="font-size:1.4rem; font-weight:800; color:var(--text); margin-top:4px;">
            ${escapeHtml(optionName)}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px; font-family:var(--font-mono); font-size:0.8rem;">
          <div>
            <span style="color:var(--text-muted);">Voter Address:</span>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
              ${createIdenticonSvg(voter, 22)}
              <span style="font-weight:700; color:var(--text);">${voter}</span>
            </div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Timestamp:</span>
            <div style="font-weight:700; color:var(--text); margin-top:4px;">${blockTime}</div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Gas Used:</span>
            <div style="font-weight:700; color:var(--text); margin-top:4px;">${receipt.gasUsed.toString()} units</div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Contract:</span>
            <div style="font-weight:700; color:var(--text); margin-top:4px;">${shortenAddress(CONTRACT_ADDRESS)}</div>
          </div>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; justify-content:space-between; border-top:1px solid var(--border); padding-top:16px;">
          <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" rel="noopener noreferrer" class="toast-tx-link">
            Inspect on Etherscan
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
          <a href="poll.html?id=${pollId}" class="btn-primary" style="font-size:0.88rem;">
            <span>View Full Ballot</span>
          </a>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Verification error:', err);
    resultContainer.innerHTML = `
      <div class="empty-state" style="border-color:var(--accent-red); padding:32px;">
        <h3 style="color:var(--accent-red); font-size:1.3rem;">Verification Error</h3>
        <p class="empty-state-desc">${escapeHtml(err.message || String(err))}</p>
      </div>
    `;
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = `<span>Verify On-Chain</span>`;
    }
  }
}

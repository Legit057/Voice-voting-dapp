/**
 * MULTIPOLL • js/create.js
 * Full-Page Poll Creation with Live Interactive Preview Card, One-Click Templates & On-Chain Deployment
 */

import { injectLayout } from './layout.js';
import { getWriteContract, getCurrentAccount, isWalletConnected, connectWallet, checkAndSwitchNetwork } from './web3.js';
import { showToast, parseContractError, createIdenticonSvg, escapeHtml } from './ui.js';

let durationMinutes = 1440; // Default 24 hours
let isBlind = false;

document.addEventListener('DOMContentLoaded', () => {
  try { injectLayout(); } catch (e) { console.error('injectLayout failed in create.js:', e); }
  try { initCreateForm(); } catch (e) { console.error('initCreateForm failed:', e); }
  try { initTemplatePresets(); } catch (e) { console.error('initTemplatePresets failed:', e); }
  try { updateLivePreview(); } catch (e) { console.error('updateLivePreview failed:', e); }
});

function initCreateForm() {
  const titleInput = document.getElementById('pollTitleInput');
  const descInput = document.getElementById('pollDescInput');
  const customDurationInput = document.getElementById('customDurationInput');
  const blindCheckbox = document.getElementById('blindVotingCheckbox');
  const addOptionBtn = document.getElementById('addOptionBtn');
  const form = document.getElementById('createPollForm');

  // Title & Desc live update
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      const charCountEl = document.getElementById('titleCharCount');
      if (charCountEl) charCountEl.textContent = `${titleInput.value.length}/120`;
      updateLivePreview();
    });
  }

  if (descInput) {
    descInput.addEventListener('input', updateLivePreview);
  }

  // Duration Presets (1h = 60, 24h = 1440, 7d = 10080, 30d = 43200)
  const presetBtns = document.querySelectorAll('.duration-preset-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = Number(btn.dataset.minutes);
      durationMinutes = val;
      if (customDurationInput) customDurationInput.value = val;
      updateLivePreview();
    });
  });

  // Custom Duration input
  if (customDurationInput) {
    customDurationInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 43200) {
        durationMinutes = val;
        presetBtns.forEach(b => {
          if (Number(b.dataset.minutes) === val) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
        updateLivePreview();
      }
    });
  }

  // Blind voting checkbox
  if (blindCheckbox) {
    blindCheckbox.addEventListener('change', (e) => {
      isBlind = e.target.checked;
      updateLivePreview();
    });
  }

  // Options dynamic builder (+ Add Option, Remove)
  if (addOptionBtn) {
    addOptionBtn.addEventListener('click', () => {
      addOptionRow();
    });
  }

  // Initial event bindings for existing option inputs
  bindOptionRowListeners();

  // Form Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleFormSubmit();
    });
  }
}

/* --------------------------------------------------------------------------
   One-Click Poll Templates
   -------------------------------------------------------------------------- */
function initTemplatePresets() {
  const templateBtns = document.querySelectorAll('.btn-template-preset');
  templateBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.template;
      applyTemplate(t);
    });
  });
}

function applyTemplate(type) {
  const titleInput = document.getElementById('pollTitleInput');
  const descInput = document.getElementById('pollDescInput');
  const list = document.getElementById('optionsBuilderList');
  if (!titleInput || !list) return;

  let title = '';
  let desc = '';
  let options = [];
  let duration = 1440;

  if (type === 'yesno') {
    title = 'Should we approve the proposed governance motion?';
    desc = 'Cast your vote in favor (Yes) or against (No). One address, one vote.';
    options = ['Yes, approve proposal', 'No, reject proposal'];
    duration = 1440;
  } else if (type === 'rating') {
    title = 'Rate your protocol satisfaction and experience';
    desc = 'Provide community sentiment on a 5-point scale.';
    options = [
      '1 - Poor (Needs work)',
      '2 - Fair (Acceptable)',
      '3 - Good (Satisfied)',
      '4 - Very Good (Impressed)',
      '5 - Excellent (Perfection)'
    ];
    duration = 10080;
  } else if (type === 'meme') {
    title = 'Meme Battle: Who wears the crown of Sepolia?';
    desc = 'Vote for the undisputed champion of Ethereum Sepolia culture!';
    options = ['Sleepy Raccoon with Coins', 'Shocked Green Frog in Blue', 'Hamster To The Moon'];
    duration = 1440;
  } else if (type === 'multi') {
    title = 'Which roadmap milestone should we prioritize next?';
    desc = 'Help guide protocol development for the upcoming quarter.';
    options = [
      'Token-Weighted Snapshot Governance',
      'ZK Anonymous Ballots (Semaphore)',
      'Quadratic Funding Model',
      'L2 Rollup Sub-Cent Finality'
    ];
    duration = 10080;
  }

  titleInput.value = title;
  if (descInput) descInput.value = desc;
  const charCountEl = document.getElementById('titleCharCount');
  if (charCountEl) charCountEl.textContent = `${title.length}/120`;

  // Set duration
  durationMinutes = duration;
  const customDurationInput = document.getElementById('customDurationInput');
  if (customDurationInput) customDurationInput.value = duration;

  const presetBtns = document.querySelectorAll('.duration-preset-btn');
  presetBtns.forEach((b) => {
    if (Number(b.dataset.minutes) === duration) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Rebuild option rows
  list.innerHTML = '';
  options.forEach((optText, idx) => {
    const row = document.createElement('div');
    row.className = 'option-input-row';
    row.innerHTML = `
      <input type="text" class="form-input option-input" value="${escapeHtml(optText)}" placeholder="Option ${idx + 1}" maxlength="80" required />
      <button type="button" class="btn-remove-option" title="Remove option" aria-label="Remove option">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    list.appendChild(row);
  });

  bindOptionRowListeners();
  updateLivePreview();
  showToast(`Applied "${type.toUpperCase()}" template!`, 'info');
}

function addOptionRow() {
  const list = document.getElementById('optionsBuilderList');
  if (!list) return;

  const currentCount = list.querySelectorAll('.option-input-row').length;
  if (currentCount >= 20) {
    showToast('Maximum of 20 options allowed per poll.', 'error');
    return;
  }

  const newIndex = currentCount + 1;
  const row = document.createElement('div');
  row.className = 'option-input-row';
  row.innerHTML = `
    <input type="text" class="form-input option-input" placeholder="Option ${newIndex} (max 80 chars)" maxlength="80" required />
    <button type="button" class="btn-remove-option" title="Remove option" aria-label="Remove option">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  list.appendChild(row);
  bindOptionRowListeners();
  updateLivePreview();
}

function bindOptionRowListeners() {
  const list = document.getElementById('optionsBuilderList');
  if (!list) return;

  const rows = list.querySelectorAll('.option-input-row');
  rows.forEach((row) => {
    const input = row.querySelector('.option-input');
    const removeBtn = row.querySelector('.btn-remove-option');

    if (input) {
      input.oninput = updateLivePreview;
    }

    if (removeBtn) {
      removeBtn.onclick = () => {
        const total = list.querySelectorAll('.option-input-row').length;
        if (total <= 2) {
          showToast('A poll must have at least 2 options.', 'error');
          return;
        }
        row.remove();
        updateLivePreview();
      };
    }
  });
}

function getOptionsValues() {
  const inputs = document.querySelectorAll('.option-input');
  const values = [];
  inputs.forEach((inp) => {
    const v = inp.value.trim();
    if (v) values.push(v);
  });
  return values;
}

function updateLivePreview() {
  const previewTitle = document.getElementById('previewCardTitle');
  const previewDesc = document.getElementById('previewCardDesc');
  const previewTimer = document.getElementById('previewCardTimer');
  const previewOptions = document.getElementById('previewCardOptions');
  const previewBadgeBlind = document.getElementById('previewBadgeBlind');
  const previewCreatorAddr = document.getElementById('previewCreatorAddr');
  const previewIdenticon = document.getElementById('previewIdenticon');

  const titleVal = document.getElementById('pollTitleInput')?.value.trim() || 'Untitled Community Ballot';
  const descVal = document.getElementById('pollDescInput')?.value.trim() || 'No description provided. The ballot description will appear here on-chain.';
  const options = getOptionsValues();

  if (previewTitle) previewTitle.textContent = titleVal;
  if (previewDesc) previewDesc.textContent = descVal;

  if (previewTimer) {
    const days = Math.floor(durationMinutes / 1440);
    const hrs = Math.floor((durationMinutes % 1440) / 60);
    const mins = durationMinutes % 60;
    let timerStr = '';
    if (days > 0) timerStr += `${days}d `;
    if (hrs > 0) timerStr += `${hrs}h `;
    if (mins > 0 || timerStr === '') timerStr += `${mins}m`;
    previewTimer.textContent = `Duration: ${timerStr.trim()}`;
  }

  if (previewBadgeBlind) {
    previewBadgeBlind.style.display = isBlind ? 'inline-flex' : 'none';
  }

  const userAddr = getCurrentAccount() || '0xYourWalletAddressHere';
  if (previewCreatorAddr) {
    previewCreatorAddr.textContent = userAddr.length > 10 ? `${userAddr.slice(0, 6)}...${userAddr.slice(-4)}` : userAddr;
  }
  if (previewIdenticon) {
    previewIdenticon.innerHTML = createIdenticonSvg(userAddr, 28);
  }

  if (previewOptions) {
    const displayOptions = options.length > 0 ? options : ['Option 1 (e.g. Yes)', 'Option 2 (e.g. No)'];
    previewOptions.innerHTML = displayOptions.map((name) => `
      <div class="option-row">
        <div class="option-progress-bg" style="width: 0%;"></div>
        <div class="option-content">
          <div class="option-line-1">
            <span class="option-name">${escapeHtml(name)}</span>
          </div>
          <div class="option-line-2">
            <div class="option-meta-left">
              <span class="option-votes-val">0</span> votes &bull; <span class="option-percent-val">0.0%</span>
            </div>
            <div class="option-meta-badges"></div>
          </div>
        </div>
      </div>
    `).join('');
  }
}

async function handleFormSubmit() {
  const title = document.getElementById('pollTitleInput')?.value.trim();
  const description = document.getElementById('pollDescInput')?.value.trim();
  const options = getOptionsValues();
  const submitBtn = document.getElementById('btnSubmitCreatePoll');

  if (!title) {
    showToast('Poll title is required.', 'error');
    return;
  }
  if (title.length > 120) {
    showToast('Poll title cannot exceed 120 characters.', 'error');
    return;
  }
  if (options.length < 2) {
    showToast('At least 2 options are required.', 'error');
    return;
  }
  if (options.length > 20) {
    showToast('A maximum of 20 options is supported.', 'error');
    return;
  }
  if (!durationMinutes || durationMinutes < 1 || durationMinutes > 43200) {
    showToast('Duration must be between 1 and 43,200 minutes (30 days).', 'error');
    return;
  }

  if (!isWalletConnected()) {
    const connected = await connectWallet();
    if (!connected) return;
  }

  const isNetworkOk = await checkAndSwitchNetwork();
  if (!isNetworkOk) return;

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Deploying Ballot to Sepolia...</span>`;
    }

    showToast('Broadcasting createPoll transaction to Sepolia...', 'info');
    const contract = await getWriteContract();
    const tx = await contract.createPoll(title, description, options, durationMinutes, isBlind);

    showToast('Transaction submitted! Awaiting block confirmation...', 'info', tx.hash);
    const receipt = await tx.wait();

    showToast('Poll created successfully on Ethereum Sepolia!', 'success', receipt.hash);

    setTimeout(() => {
      window.location.href = 'polls.html';
    }, 1500);
  } catch (err) {
    console.error('Failed to create poll:', err);
    showToast(parseContractError(err), 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <span>Launch Poll on Ethereum Sepolia</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
    }
  }
}

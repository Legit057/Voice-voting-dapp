/**
 * MULTIPOLL • js/ui.js
 * Toast Notifications, Deterministic Identicons, Confetti, Confirm Modal, Vote Receipts & Helpers
 */

/* --------------------------------------------------------------------------
   1. Deterministic SVG Identicon (No external requests)
   -------------------------------------------------------------------------- */
export function createIdenticonSvg(address, size = 28) {
  if (!address || typeof address !== 'string' || address.length < 8) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="#333"><circle cx="16" cy="16" r="14"/></svg>`;
  }

  const clean = address.toLowerCase().replace('0x', '').padEnd(40, '0');
  const palette = [
    '#FF5A1F', '#C6FF4D', '#4C5DFF', '#FFC20E', '#00A651',
    '#7B6CFF', '#EF4444', '#06B6D4', '#EC4899', '#F97316'
  ];

  const color1 = palette[parseInt(clean.slice(0, 2), 16) % palette.length];
  const color2 = palette[parseInt(clean.slice(2, 4), 16) % palette.length];
  const color3 = palette[parseInt(clean.slice(4, 6), 16) % palette.length];

  const shapes = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 2; x++) {
      const idx = (y * 2 + x) * 2;
      const val = parseInt(clean.slice(idx, idx + 2), 16);
      if (val % 2 === 0) {
        const fill = val % 3 === 0 ? color1 : (val % 3 === 1 ? color2 : color3);
        const posX = 4 + x * 8;
        const posY = 4 + y * 6;
        shapes.push(`<rect x="${posX}" y="${posY}" width="8" height="6" fill="${fill}" />`);
        if (x === 0) {
          shapes.push(`<rect x="${28 - posX}" y="${posY}" width="8" height="6" fill="${fill}" />`);
        }
      }
    }
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 36 36" fill="none" class="identicon" aria-hidden="true">
      <rect width="36" height="36" rx="18" fill="#111111" />
      <g clip-path="url(#circleClip-${clean.slice(0, 6)})">
        ${shapes.join('')}
      </g>
      <defs>
        <clipPath id="circleClip-${clean.slice(0, 6)}">
          <circle cx="18" cy="18" r="18"/>
        </clipPath>
      </defs>
    </svg>
  `;
}

export function getIdenticonUrl(address, size = 28) {
  const svg = createIdenticonSvg(address, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* --------------------------------------------------------------------------
   2. Toast Notifications (Max 3, De-duplicated, Progress Bar, Close Button)
   -------------------------------------------------------------------------- */
export function showToast(message, type = 'info', txHash = null) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  // De-duplicate: check if identical message is already showing
  const existingToasts = Array.from(container.querySelectorAll('.toast'));
  const isDuplicate = existingToasts.some(t => {
    const msgEl = t.querySelector('.toast-msg');
    return msgEl && msgEl.textContent.trim() === String(message).trim();
  });
  if (isDuplicate) return;

  // Enforce max 3 visible toasts
  while (container.children.length >= 3) {
    container.removeChild(container.firstElementChild);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.position = 'relative';
  toast.style.overflow = 'hidden';

  const durationMs = type === 'error' ? 6000 : 4000;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00D26A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  } else if (type === 'error') {
    iconSvg = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;
  } else {
    iconSvg = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4C5DFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
  }

  let txLinkHtml = '';
  if (txHash) {
    const cleanHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
    const truncated = `${cleanHash.slice(0, 10)}...${cleanHash.slice(-6)}`;
    txLinkHtml = `
      <a href="https://sepolia.etherscan.io/tx/${cleanHash}" target="_blank" rel="noopener noreferrer" class="toast-tx-link">
        View on Etherscan (${truncated})
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </a>
    `;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-body">
      <div class="toast-title">${type === 'success' ? 'Success' : (type === 'error' ? 'Notice' : 'Information')}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
      ${txLinkHtml}
    </div>
    <button type="button" class="toast-close-btn" aria-label="Dismiss notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="toast-progress-bar" style="animation-duration: ${durationMs}ms;"></div>
  `;

  container.appendChild(toast);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 250);
  };

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) closeBtn.onclick = dismiss;

  setTimeout(dismiss, durationMs);
}

/* --------------------------------------------------------------------------
   3. Confetti Celebration
   -------------------------------------------------------------------------- */
export function fireConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF5A1F', '#C6FF4D', '#4C5DFF', '#FFC20E', '#00A651']
    });
  }
}

/* --------------------------------------------------------------------------
   4. Reusable Confirmation Dialog
   -------------------------------------------------------------------------- */
export function confirmDialog(options = {}) {
  const {
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmClass = 'btn-primary',
    onConfirm = () => {}
  } = options;

  let overlay = document.getElementById('globalConfirmModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'globalConfirmModal';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
      <div class="modal-header">
        <h3 id="confirmModalTitle" class="modal-title">${escapeHtml(title)}</h3>
        <button type="button" class="btn-close-modal" id="confirmModalClose" aria-label="Close dialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="confirmModalCancel">${escapeHtml(cancelText)}</button>
        <button type="button" class="${confirmClass}" id="confirmModalOk">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  overlay.classList.add('open');
  document.body.classList.add('modal-open');

  const closeDialog = () => {
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
  };

  overlay.querySelector('#confirmModalClose').onclick = closeDialog;
  overlay.querySelector('#confirmModalCancel').onclick = closeDialog;
  overlay.querySelector('#confirmModalOk').onclick = () => {
    closeDialog();
    try {
      onConfirm();
    } catch (e) {
      console.error(e);
    }
  };
}

/* --------------------------------------------------------------------------
   5. Official On-Chain Vote Receipt Modal
   -------------------------------------------------------------------------- */
export function showVoteReceiptModal(data = {}) {
  const {
    pollTitle = 'Community Poll',
    optionName = 'Voted Option',
    txHash = '0x0000000000000000000000000000000000000000',
    blockNumber = 0,
    voterAddress = '0x0000000000000000000000000000000000000000',
    pollId = 1
  } = data;

  let overlay = document.getElementById('voteReceiptModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'voteReceiptModal';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  const shortTx = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
  const shortVoter = `${voterAddress.slice(0, 8)}...${voterAddress.slice(-6)}`;
  const dateStr = new Date().toUTCString();

  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width: 540px;" role="dialog" aria-modal="true" aria-labelledby="receiptModalTitle">
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M16 3 L28 10 L16 17 L4 10 Z" fill="#C6FF4D" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M4 10 L16 17 L16 29 L4 22 Z" fill="#FF5A1F" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M16 17 L28 10 L28 22 L16 29 Z" fill="#D9430F" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
            <polyline points="7 19 11 23 15 15" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <h3 id="receiptModalTitle" class="modal-title">VOTE RECEIPT</h3>
        </div>
        <button type="button" class="btn-close-modal" id="receiptModalClose" aria-label="Close receipt">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body" id="receiptContentToPrint" style="padding: 24px; display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">
            ETHEREUM SEPOLIA &bull; VOTEFI
          </span>
          <span class="verified-badge">VERIFIED ON-CHAIN</span>
        </div>

        <div>
          <div style="font-size:0.75rem; text-transform:uppercase; font-family:var(--font-mono); color:var(--text-muted);">
            Ballot Question
          </div>
          <div style="font-weight:700; font-size:1.1rem; color:var(--text); margin-top:2px;">
            ${escapeHtml(pollTitle)}
          </div>
        </div>

        <div style="background:var(--surface-card); border:1.5px solid var(--accent-lime); border-radius:var(--radius-md); padding:14px;">
          <div style="font-size:0.72rem; text-transform:uppercase; font-family:var(--font-mono); color:var(--accent-lime); font-weight:700;">
            Your Cast Choice
          </div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--text); margin-top:4px;">
            ${escapeHtml(optionName)}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-family:var(--font-mono); font-size:0.78rem;">
          <div>
            <span style="color:var(--text-muted);">Voter:</span>
            <div style="font-weight:700; color:var(--text);">${shortVoter}</div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Block Number:</span>
            <div style="font-weight:700; color:var(--text);">#${blockNumber || 'Pending'}</div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Confirmations:</span>
            <div id="receiptConfirmationsCount" style="font-weight:700; color:#00D26A;">1 confirmation</div>
          </div>
          <div>
            <span style="color:var(--text-muted);">Timestamp:</span>
            <div style="font-weight:700; color:var(--text);">${dateStr.slice(0, 16)}</div>
          </div>
        </div>

        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; display:flex; align-items:center; justify-content:space-between;">
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text);">${shortTx}</span>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-copy-address" id="receiptCopyTxBtn" title="Copy Transaction Hash">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" rel="noopener noreferrer" class="toast-tx-link" style="font-size:0.75rem;">
              Etherscan
            </a>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="justify-content:space-between;">
        <a href="verify.html?tx=${txHash}" class="btn-secondary" style="font-size:0.85rem;">
          Verify On-Chain
        </a>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn-primary" id="btnDownloadReceiptPng">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download PNG</span>
          </button>
        </div>
      </div>
    </div>
  `;

  overlay.classList.add('open');
  document.body.classList.add('modal-open');

  const closeDialog = () => {
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
  };

  overlay.querySelector('#receiptModalClose').onclick = closeDialog;

  // Copy TX
  overlay.querySelector('#receiptCopyTxBtn').onclick = () => {
    navigator.clipboard.writeText(txHash);
    showToast('Transaction hash copied!', 'success');
  };

  // Download Receipt as PNG (via pure canvas generator)
  overlay.querySelector('#btnDownloadReceiptPng').onclick = () => {
    downloadReceiptAsPng({
      pollTitle,
      optionName,
      txHash,
      blockNumber,
      voterAddress,
      pollId,
      dateStr
    });
  };
}

/* --------------------------------------------------------------------------
   Canvas PNG Receipt Generator
   -------------------------------------------------------------------------- */
function downloadReceiptAsPng(details) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0E0E0E';
  ctx.fillRect(0, 0, 720, 900);

  // Border
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, 680, 860);

  // Top Accent Bar
  ctx.fillStyle = '#C6FF4D';
  ctx.fillRect(20, 20, 680, 12);

  // Title & Header
  ctx.fillStyle = '#FFF8EE';
  ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('VOICE RECEIPT', 50, 90);

  ctx.fillStyle = '#A3A3A3';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('ETHEREUM SEPOLIA ON-CHAIN CONSENSUS', 50, 120);

  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 145);
  ctx.lineTo(670, 145);
  ctx.stroke();

  // Ballot Question
  ctx.fillStyle = '#FF5A1F';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText('BALLOT QUESTION', 50, 185);

  ctx.fillStyle = '#FFF8EE';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  // Simple word wrapping for title
  const words = details.pollTitle.split(' ');
  let line = '';
  let y = 220;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 600 && n > 0) {
      ctx.fillText(line, 50, y);
      line = words[n] + ' ';
      y += 30;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 50, y);

  // Chosen Option Card
  y += 40;
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(50, y, 620, 110);
  ctx.strokeStyle = '#C6FF4D';
  ctx.lineWidth = 3;
  ctx.strokeRect(50, y, 620, 110);

  ctx.fillStyle = '#C6FF4D';
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText('REGISTERED VOTE CHOICE', 70, y + 36);

  ctx.fillStyle = '#FFF8EE';
  ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(details.optionName, 70, y + 80);

  // Metadata Grid
  y += 160;
  ctx.fillStyle = '#A3A3A3';
  ctx.font = '14px "JetBrains Mono", monospace';

  ctx.fillText('VOTER ADDRESS:', 50, y);
  ctx.fillStyle = '#FFF8EE';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.fillText(details.voterAddress, 50, y + 25);

  y += 65;
  ctx.fillStyle = '#A3A3A3';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('TRANSACTION HASH:', 50, y);
  ctx.fillStyle = '#FF5A1F';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.fillText(details.txHash, 50, y + 25);

  y += 65;
  ctx.fillStyle = '#A3A3A3';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('BLOCK NUMBER:', 50, y);
  ctx.fillStyle = '#FFF8EE';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillText('#' + details.blockNumber, 50, y + 25);

  ctx.fillStyle = '#A3A3A3';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('TIMESTAMP:', 380, y);
  ctx.fillStyle = '#FFF8EE';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillText(details.dateStr.slice(0, 16), 380, y + 25);

  // Footer verified badge
  y += 80;
  ctx.fillStyle = '#00A651';
  ctx.fillRect(50, y, 620, 50);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CRYPTOGRAPHICALLY VERIFIED ON ETHEREUM SEPOLIA', 360, y + 32);

  // Trigger download
  const link = document.createElement('a');
  link.download = `vote-receipt-poll-${details.pollId}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('Vote receipt downloaded as PNG!', 'success');
}

/* --------------------------------------------------------------------------
   6. Number Count-up Animation
   -------------------------------------------------------------------------- */
export function animateNumber(element, target, duration = 1200) {
  if (!element) return;
  const targetNum = Number(target) || 0;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = targetNum.toLocaleString();
    return;
  }

  const start = 0;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (targetNum - start) * easeOut);
    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetNum.toLocaleString();
    }
  }

  requestAnimationFrame(update);
}

/* --------------------------------------------------------------------------
   7. LocalStorage "Hide for Me" Helper
   -------------------------------------------------------------------------- */
const HIDDEN_KEY = 'multipoll_hidden_polls';

export function getHiddenPolls() {
  try {
    const stored = localStorage.getItem(HIDDEN_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function hidePollForMe(pollId) {
  const current = getHiddenPolls();
  const idStr = String(pollId);
  if (!current.includes(idStr)) {
    current.push(idStr);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(current));
  }
}

export function isPollHidden(pollId) {
  const current = getHiddenPolls();
  return current.includes(String(pollId));
}

/* --------------------------------------------------------------------------
   8. Formatting Helpers
   -------------------------------------------------------------------------- */
export function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string') return '0x0000...0000';
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function areAddressesEqual(addr1, addr2) {
  if (!addr1 || !addr2) return false;
  try {
    if (typeof window !== 'undefined' && window.ethers && typeof window.ethers.getAddress === 'function') {
      return window.ethers.getAddress(addr1) === window.ethers.getAddress(addr2);
    }
  } catch (e) {
    // ignore
  }
  return String(addr1).trim().toLowerCase() === String(addr2).trim().toLowerCase();
}

export function formatTimeLeft(endTimeSeconds, isCancelled = false) {
  if (isCancelled) return 'Cancelled';
  if (!endTimeSeconds) return 'Ended';
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(endTimeSeconds) - now;
  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(1, minutes)}m left`;
}

export function guardString(rendered) {
  if (typeof rendered === 'string' && rendered.includes('[object Object]')) {
    console.warn('[VOICE Development Guard] Rendered HTML contains [object Object]:', rendered);
  }
  return rendered;
}

export function formatTimeRemaining(endTimeSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(endTimeSeconds) - now;

  if (diff <= 0) {
    return { isEnded: true, text: 'Ended' };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  if (days > 0) {
    return {
      isEnded: false,
      text: `${days}d ${hours}h ${minutes}m`
    };
  }

  const pad = (n) => String(n).padStart(2, '0');
  return {
    isEnded: false,
    text: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function parseContractError(err) {
  if (!err) return 'Unknown error occurred.';
  const msg = err.message || String(err);

  if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED') || err.code === 4001) {
    return 'Transaction rejected by user.';
  }
  if (msg.includes('insufficient funds')) {
    return 'Insufficient Sepolia ETH for gas fees.';
  }
  if (msg.includes('Poll has ended')) {
    return 'This poll has ended. No further votes can be cast.';
  }
  if (msg.includes('Already voted')) {
    return 'You have already voted on this poll.';
  }
  if (msg.includes('Poll is archived')) {
    return 'This poll has been archived.';
  }
  if (msg.includes('Poll is cancelled')) {
    return 'This poll was cancelled by its creator.';
  }
  if (msg.includes('Poll has active votes')) {
    return 'Cannot cancel: poll already has votes cast.';
  }
  if (msg.includes('Poll is active')) {
    return 'Cannot archive while the poll is still active.';
  }
  if (msg.includes('Only creator can')) {
    return 'Unauthorized: only the poll creator can execute this action.';
  }

  return msg.length > 120 ? `${msg.slice(0, 117)}...` : msg;
}

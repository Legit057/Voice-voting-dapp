/**
 * MULTIPOLL • js/debug.js
 * Comprehensive Diagnostic & Telemetry Overlay
 * Activated via ?debug=1, Ctrl+Shift+D, or clicking the footer status text
 */

import { CONTRACT_ADDRESS } from '../contract-config.js';
import { diagnosticReport, getNetworkStatus } from './web3.js';
import * as wallet from './wallet.js';

// Circular buffer of last 30 console errors and warnings
const MAX_LOGS = 30;
export const recentLogs = [];

function maskKey(str) {
  if (!str) return '';
  return String(str).replace(/([a-zA-Z0-9_-]{20,})/g, (m) => m.slice(0, 4) + '...' + m.slice(-4));
}

function captureLog(level, args) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const text = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

  recentLogs.push({
    time: timestamp,
    level,
    message: maskKey(text)
  });

  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

// Intercept console.error and console.warn immediately
const originalError = console.error;
const originalWarn = console.warn;

console.error = function (...args) {
  captureLog('error', args);
  originalError.apply(console, args);
};

console.warn = function (...args) {
  captureLog('warn', args);
  originalWarn.apply(console, args);
};

window.addEventListener('error', (event) => {
  captureLog('uncaught', [event.message || 'Script error', event.filename ? `${event.filename}:${event.lineno}` : '']);
});

window.addEventListener('unhandledrejection', (event) => {
  captureLog('rejection', [event.reason ? (event.reason.stack || event.reason.message || event.reason) : 'Unhandled rejection']);
});

/**
 * Builds the current diagnostic report object
 */
export async function buildDebugReport() {
  const netStatus = await getNetworkStatus().catch(() => null);

  const eth = typeof window !== 'undefined' ? window.ethereum : null;
  const providersInfo = Array.isArray(eth?.providers)
    ? eth.providers.map((p, idx) => ({
        index: idx,
        isMetaMask: Boolean(p.isMetaMask),
        isBraveWallet: Boolean(p.isBraveWallet),
        isCoinbaseWallet: Boolean(p.isCoinbaseWallet)
      }))
    : null;

  const rawEndpoint = diagnosticReport.activeEndpoint || 'unknown';
  let endpointHost = 'unknown';
  try {
    const parsed = new URL(rawEndpoint);
    endpointHost = parsed.hostname;
  } catch {
    endpointHost = maskKey(rawEndpoint);
  }

  return {
    timestamp: new Date().toISOString(),
    pageUrl: window.location.href,
    contractAddress: CONTRACT_ADDRESS,
    activeReadEndpoint: {
      host: endpointHost,
      fullMasked: maskKey(rawEndpoint)
    },
    startupChecks: { ...diagnosticReport.startupChecks },
    footerNetworkStatus: {
      reachable: netStatus?.reachable ?? false,
      blockNumber: netStatus?.blockNumber ?? 0,
      gasPriceGwei: netStatus?.gasPriceGwei ?? '0.00',
      statusText: netStatus?.statusText ?? 'Unknown',
      failingCheck: netStatus?.failingCheck ?? null
    },
    walletState: {
      providerName: wallet.state.providerName,
      rdns: wallet.state.rdns,
      address: wallet.state.address,
      chainId: wallet.state.chainId,
      status: wallet.state.status,
      isMetaMask: wallet.state.isMetaMask,
      isBraveWallet: wallet.state.isBrave,
      windowEthereumExists: Boolean(eth),
      hasMultipleProviders: Array.isArray(eth?.providers),
      providers: providersInfo,
      announcedEip6963: wallet.getDiscoveredProviders()
    },
    recentLogs: [...recentLogs]
  };
}

let overlayElement = null;

export async function showDebugOverlay() {
  if (overlayElement) {
    overlayElement.style.display = 'flex';
    await refreshDebugOverlay();
    return;
  }

  overlayElement = document.createElement('div');
  overlayElement.id = 'debugReportModal';
  overlayElement.setAttribute('role', 'dialog');
  overlayElement.setAttribute('aria-label', 'Debug Report Panel');
  overlayElement.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    color: #E2E8F0;
  `;

  overlayElement.innerHTML = `
    <div style="
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 12px;
      width: min(840px, 100%);
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: #1E293B;
        border-bottom: 1px solid #334155;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#00D26A;"></span>
          <strong>VOICE Diagnostic & Telemetry Report</strong>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="copyDebugReportBtn" style="
            background: #FF5A1F;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 12px;
          ">Copy Report JSON</button>
          <button id="closeDebugOverlayBtn" style="
            background: #334155;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
          ">Close</button>
        </div>
      </div>
      <div id="debugContentArea" style="
        padding: 16px;
        overflow-y: auto;
        flex: 1;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
      ">Loading diagnostic data...</div>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Close handlers
  overlayElement.querySelector('#closeDebugOverlayBtn').addEventListener('click', hideDebugOverlay);
  overlayElement.addEventListener('click', (e) => {
    if (e.target === overlayElement) hideDebugOverlay();
  });

  // Copy handler
  overlayElement.querySelector('#copyDebugReportBtn').addEventListener('click', async () => {
    const report = await buildDebugReport();
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    const btn = overlayElement.querySelector('#copyDebugReportBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy Report JSON';
    }, 2000);
  });

  await refreshDebugOverlay();
}

export function hideDebugOverlay() {
  if (overlayElement) {
    overlayElement.style.display = 'none';
  }
}

export async function refreshDebugOverlay() {
  if (!overlayElement) return;
  const area = overlayElement.querySelector('#debugContentArea');
  if (!area) return;

  const report = await buildDebugReport();

  const checksHtml = Object.entries(report.startupChecks)
    .map(([name, data]) => {
      const color = data.pass ? '#00D26A' : '#EF4444';
      const mark = data.pass ? 'PASS' : 'FAIL';
      return `  <span style="color:${color};">[${mark}]</span> ${name.padEnd(14)}: ${JSON.stringify(data.val)} (${data.ms}ms)`;
    })
    .join('\n');

  const logsHtml = report.recentLogs.length === 0
    ? '  (No warnings or errors captured yet)'
    : report.recentLogs
        .map((l) => {
          const color = l.level === 'warn' ? '#F59E0B' : '#EF4444';
          return `  [${l.time}] <span style="color:${color};">[${l.level.toUpperCase()}]</span> ${l.message}`;
        })
        .join('\n');

  area.innerHTML = `
<span style="color:#C6FF4D;">=== ENVIRONMENT & RPC ===</span>
Page:             ${report.pageUrl}
Contract:         ${report.contractAddress}
Active Endpoint:  ${report.activeReadEndpoint.host} (${report.activeReadEndpoint.fullMasked})
Footer Status:    ${report.footerNetworkStatus.statusText} (${report.footerNetworkStatus.failingCheck || 'All checks passing'})
Block Number:     #${report.footerNetworkStatus.blockNumber}
Gas Price:        ${report.footerNetworkStatus.gasPriceGwei} Gwei

<span style="color:#C6FF4D;">=== STARTUP HEALTH CHECKS ===</span>
${checksHtml}

<span style="color:#C6FF4D;">=== WALLET STATE ===</span>
Status:           ${report.walletState.status}
Provider Name:    ${report.walletState.providerName || 'none'} (rdns: ${report.walletState.rdns || 'none'})
Address:          ${report.walletState.address || 'none'}
Chain ID:         ${report.walletState.chainId || 'none'}
isMetaMask:       ${report.walletState.isMetaMask}
isBraveWallet:    ${report.walletState.isBraveWallet}
window.ethereum:  ${report.walletState.windowEthereumExists} (hasMultiple: ${report.walletState.hasMultipleProviders})
EIP-6963 Ann.:    ${JSON.stringify(report.walletState.announcedEip6963)}

<span style="color:#C6FF4D;">=== LAST ${report.recentLogs.length} LOGS (Console errors & warnings) ===</span>
${logsHtml}
  `;
}

// Global Hotkeys and Event Listeners
if (typeof window !== 'undefined') {
  // 1. Ctrl+Shift+D
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      if (overlayElement && overlayElement.style.display !== 'none') {
        hideDebugOverlay();
      } else {
        showDebugOverlay();
      }
    }
  });

  // 2. Auto-open if ?debug=1
  if (window.location.search.includes('debug=1')) {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        showDebugOverlay();
      }, 1000);
    });
  }

  // 3. Click handler on footer status text (attached via event delegation)
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (
      target &&
      (target.id === 'footerReachableStatus' ||
       target.id === 'footerStatusDot' ||
       target.closest('#footerStatusItem'))
    ) {
      // Don't intercept copy button, links, help button, popover, or mobile toggles
      if (
        target.closest('.btn-copy-address') ||
        target.closest('.toast-tx-link') ||
        target.closest('.verified-badge-link') ||
        target.closest('a') ||
        target.closest('.btn-status-help') ||
        target.closest('.status-help-popover') ||
        target.closest('.btn-footer-details-toggle') ||
        target.closest('.btn-switch-network-inline')
      ) {
        return;
      }
      showDebugOverlay();
    }
  });
}

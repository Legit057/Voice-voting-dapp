/**
 * MULTIPOLL • js/layout.js
 * Injects Shared Pill Navbar with Isometric 3D Cube Logo, Footer with Network Telemetry, Wallet Dropdown, XP Level Chip
 */

import { initTheme } from './theme.js';
import {
  initWeb3,
  connectWallet,
  disconnectWallet,
  getCurrentAccount,
  isWalletConnected,
  getAccountBalance,
  checkAndSwitchNetwork,
  isCorrectNetwork,
  getNetworkStatus
} from './web3.js';
import { shortenAddress, showToast, createIdenticonSvg } from './ui.js';
import { CONTRACT_ADDRESS, VERIFIED } from '../contract-config.js';
import { initPerRouteStickers } from './scene3d.js';
import { initPageTransitions } from './transitions.js';

export function injectLayout() {
  try {
    document.documentElement.classList.add('js-ready');
    setTimeout(() => {
      document.querySelectorAll('.fade-in, .scroll-reveal, [data-reveal]').forEach((el) => {
        el.classList.add('revealed');
      });
    }, 1500);
  } catch (e) {}

  try { injectNavbar(); } catch (err) { console.error('injectNavbar failed:', err); }
  try { injectFooter(); } catch (err) { console.error('injectFooter failed:', err); }
  try { initTheme(); } catch (err) { console.error('initTheme failed:', err); }
  try { initWeb3(); } catch (err) { console.error('initWeb3 failed:', err); }
  try { setupNavEventListeners(); } catch (err) { console.error('setupNavEventListeners failed:', err); }
  try { updateNetworkStatusPanel(); } catch (err) { console.error('updateNetworkStatusPanel failed:', err); }
  try { initPerRouteStickers(); } catch (err) { console.error('initPerRouteStickers failed:', err); }
  try { initPageTransitions(); } catch (err) { console.error('initPageTransitions failed:', err); }

  // Periodic network telemetry update
  setInterval(() => {
    try { updateNetworkStatusPanel(); } catch (err) { console.error('updateNetworkStatusPanel interval error:', err); }
  }, 12000);
}

/* --------------------------------------------------------------------------
   Isometric Cube Logo SVG Component
   Top face lime #C6FF4D, left face orange #FF5A1F with white check,
   right face darker orange #D9430F, stroke using currentColor (theme text color).
   -------------------------------------------------------------------------- */
export function getIsometricCubeLogoSvg(size = 32) {
  return `
    <div class="brand-cube-mark" aria-hidden="true">
      <svg class="brand-cube-svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none">
        <!-- Top Face Lime #C6FF4D -->
        <path d="M16 3 L28 10 L16 17 L4 10 Z" fill="#C6FF4D" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- Left Face Orange #FF5A1F with check -->
        <path d="M4 10 L16 17 L16 29 L4 22 Z" fill="#FF5A1F" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- Right Face Darker Orange #D9430F -->
        <path d="M16 17 L28 10 L28 22 L16 29 Z" fill="#D9430F" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- White Check Mark on Left Face -->
        <polyline points="7 19 11 23 15 15" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   1. Inject Floating Pill Navbar
   -------------------------------------------------------------------------- */
function injectNavbar() {
  const currentPath = window.location.pathname.toLowerCase();
  const getActiveClass = (page) => {
    if (page === 'index' && (currentPath.endsWith('/') || currentPath.endsWith('index.html') || currentPath === '')) {
      return 'active';
    }
    if (currentPath.includes(page)) {
      return 'active';
    }
    return '';
  };

  const navHtml = `
    <div class="nav-wrapper">
      <header class="navbar" role="banner">
        <div class="nav-container">
          <!-- 1. Brand Logo: Isometric Cube Mark + VOICE alone -->
          <a href="index.html" class="brand" aria-label="VOICE Home">
            ${getIsometricCubeLogoSvg(32)}
            <span class="brand-title">VOICE</span>
          </a>

          <!-- 2. Nav Center Links: Priority-Plus Navigation -->
          <nav class="nav-center-links" id="navCenterLinks" aria-label="Main Navigation">
            <div class="nav-primary-links" id="navPrimaryLinks">
              <a href="index.html" class="nav-link ${getActiveClass('index')}">Home</a>
              <a href="polls.html" class="nav-link ${getActiveClass('polls')}">Polls</a>
              <a href="create.html" class="nav-link ${getActiveClass('create')}">Create</a>
              <a href="dashboard.html" class="nav-link ${getActiveClass('dashboard')}">Dashboard</a>
            </div>

            <!-- More Dropdown -->
            <div class="nav-more" id="navMoreWrapper">
              <button type="button" class="nav-link nav-more-btn" id="navMoreBtn" aria-haspopup="true" aria-expanded="false">
                <span>More</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="nav-more-menu" id="navMoreMenu" role="menu">
                <a href="leaderboard.html" class="nav-more-item ${getActiveClass('leaderboard')}">Leaderboard</a>
                <a href="verify.html" class="nav-more-item ${getActiveClass('verify')}">Verify</a>
                <a href="how-it-works.html" class="nav-more-item ${getActiveClass('how-it-works')}">How It Works</a>
                <span class="nav-more-item nav-more-item-disabled" title="Communities coming soon">
                  Communities <span class="badge-soon">Soon</span>
                </span>
              </div>
            </div>
          </nav>

          <!-- 3. Flexible Space -->
          <div class="nav-flexible-space"></div>

            <!-- Network Ribbon -->
            <div id="networkRibbon" class="network-ribbon" title="Connected to Ethereum Sepolia" role="status">
              <span class="status-dot"></span>
              <span id="networkRibbonText">SEPOLIA</span>
            </div>

            <!-- Dark / Light Theme Toggle -->
            <button type="button" id="themeToggleBtn" class="btn-icon-toggle" aria-label="Toggle Theme">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>

            <!-- Wallet Area -->
            <div class="wallet-dropdown-wrapper">
              <button type="button" id="walletConnectBtn" class="btn-wallet-connect">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path>
                  <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path>
                  <circle cx="18" cy="16" r="2"></circle>
                </svg>
                <span>Connect Wallet</span>
              </button>

              <!-- Connected Wallet Dropdown Menu -->
              <div id="walletDropdownMenu" class="wallet-dropdown-menu" role="menu">
                <div class="wallet-menu-header">
                  <div class="wallet-menu-row">
                    <span class="wallet-menu-label">Sepolia Balance</span>
                    <span class="wallet-menu-val" id="menuBalanceVal">0.000 SEP</span>
                  </div>
                  <div class="wallet-menu-row">
                    <span class="wallet-menu-label">Reputation XP</span>
                    <span class="wallet-menu-val" id="menuXpStatus">Level 1 &bull; 0 XP</span>
                  </div>
                  <div class="wallet-menu-row wallet-network-row">
                    <span class="status-dot"></span>
                    <span class="wallet-menu-val">Ethereum Sepolia (11155111)</span>
                  </div>
                </div>

                <button type="button" class="wallet-menu-item" id="menuCopyAddressBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copy Address</span>
                </button>
                <a href="#" target="_blank" rel="noopener noreferrer" class="wallet-menu-item" id="menuViewEtherscanLink">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  <span>View on Etherscan</span>
                </a>
                <a href="dashboard.html" class="wallet-menu-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>My Activity</span>
                </a>
                <button type="button" class="wallet-menu-item danger" id="menuDisconnectBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>Disconnect</span>
                </button>
              </div>
            </div>

            <!-- 7. Create Button -->
            <a href="create.html" class="btn-primary btn-nav-create" aria-label="Create Poll">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span class="btn-create-text">Create</span>
            </a>

            <!-- Mobile Hamburger Toggle -->
            <button type="button" class="btn-hamburger" id="navHamburgerBtn" aria-label="Toggle navigation menu" aria-expanded="false">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
        </div>

        <!-- Mobile Drawer -->
        <div class="mobile-drawer" id="mobileNavDrawer" aria-hidden="true">
          <div class="mobile-drawer-content">
            <a href="index.html" class="mobile-nav-link ${getActiveClass('index')}">Home</a>
            <a href="polls.html" class="mobile-nav-link ${getActiveClass('polls')}">Browse Polls</a>
            <a href="create.html" class="mobile-nav-link ${getActiveClass('create')}">Create Poll</a>
            <a href="dashboard.html" class="mobile-nav-link ${getActiveClass('dashboard')}">My Activity</a>
            <a href="leaderboard.html" class="mobile-nav-link ${getActiveClass('leaderboard')}">Leaderboard</a>
            <a href="verify.html" class="mobile-nav-link ${getActiveClass('verify')}">Verify</a>
            <a href="how-it-works.html" class="mobile-nav-link ${getActiveClass('how-it-works')}">How It Works</a>
          </div>
        </div>
      </header>
    </div>
  `;

  const siteHeader = document.getElementById('site-header');
  if (siteHeader) {
    siteHeader.innerHTML = navHtml;
    return;
  }
  const existingNav = document.querySelector('.nav-wrapper');
  if (existingNav) {
    existingNav.outerHTML = navHtml;
    return;
  }
  document.body.insertAdjacentHTML('afterbegin', `<div id="site-header">${navHtml}</div>`);
}

/* --------------------------------------------------------------------------
   2. Inject Shared Footer & Telemetry
   -------------------------------------------------------------------------- */
function injectFooter() {

  const footerHtml = `
    <footer class="footer-wrapper" role="contentinfo">
      <div class="container">
        <!-- Live Network Telemetry Status Panel -->
        <div class="network-status-panel">
          <div class="net-item">
            <span class="status-dot" id="footerStatusDot" style="color:#00D26A;"></span>
            <span class="net-label">Network:</span>
            <span class="net-val">Ethereum Sepolia (11155111)</span>
          </div>

          <div class="net-item">
            <span class="net-label">Block:</span>
            <span class="net-val" id="footerBlockNumber">Fetching...</span>
          </div>

          <div class="net-item">
            <span class="net-label">Gas:</span>
            <span class="net-val" id="footerGasPrice" style="color:var(--accent-orange);">~0.1 Gwei</span>
          </div>

          <div class="net-item">
            <span class="net-label">Contract:</span>
            <span class="net-val-code">
              <span id="footerContractAddr">${shortenAddress(CONTRACT_ADDRESS)}</span>
              <button type="button" class="btn-copy-address" id="footerCopyContractBtn" title="Copy Contract Address" aria-label="Copy Contract Address">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </span>
            ${VERIFIED ? `<span class="verified-badge" title="Source code verified on Sepolia Etherscan">VERIFIED</span>` : ''}
          </div>

          <div class="net-item">
            <span class="net-label">Status:</span>
            <span class="net-val" id="footerReachableStatus" style="color:#00D26A;">Reachable</span>
          </div>

          <div class="net-item">
            <a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code" target="_blank" rel="noopener noreferrer" class="toast-tx-link">
              Etherscan
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>

        <!-- Footer Main Links -->
        <div class="footer-top">
          <div>
            <div class="brand">
              ${getIsometricCubeLogoSvg(34)}
              <span class="brand-title">VOICE</span>
            </div>
            <p class="footer-brand-desc">
              Decentralized, non-custodial multi-poll voting with zero double-voting, cryptographic blind ballots, and transparent on-chain execution on Ethereum Sepolia.
            </p>
          </div>

          <div>
            <h4 class="footer-heading">Protocol</h4>
            <ul class="footer-links">
              <li><a href="index.html">Home</a></li>
              <li><a href="polls.html">Browse Polls</a></li>
              <li><a href="create.html">Create a Poll</a></li>
              <li><a href="dashboard.html">My Activity</a></li>
              <li><a href="leaderboard.html">Leaderboard & XP</a></li>
              <li><a href="verify.html">Verify a Vote</a></li>
              <li><a href="how-it-works.html">How It Works</a></li>
            </ul>
          </div>

          <div>
            <h4 class="footer-heading">Developers & Trust</h4>
            <ul class="footer-links">
              <li><a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code" target="_blank" rel="noopener noreferrer">Smart Contract Code</a></li>
              <li><a href="verify.html">Cryptographic Vote Verifier</a></li>
              <li><a href="how-it-works.html#faq">FAQ & Rules</a></li>
            </ul>
          </div>
        </div>

        <!-- Footer Bottom Disclaimer -->
        <div class="footer-bottom">
          <div>&copy; 2026 VOICE. Built for decentralized consensus on Ethereum Sepolia.</div>
          <div class="meme-disclaimer">Meme art belongs to its original creators; used for demo purposes</div>
        </div>
      </div>
    </footer>
  `;

  const existingFooter = document.querySelector('.footer-wrapper');
  if (existingFooter) {
    existingFooter.outerHTML = footerHtml;
  } else {
    document.body.insertAdjacentHTML('beforeend', footerHtml);
  }

  // Bind footer contract copy button
  const copyBtn = document.getElementById('footerCopyContractBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(CONTRACT_ADDRESS);
      showToast('Contract address copied to clipboard!', 'success');
    });
  }
}

/* --------------------------------------------------------------------------
   3. Event Listeners & UI State Binding
   -------------------------------------------------------------------------- */
function setupNavEventListeners() {
  const walletBtn = document.getElementById('walletConnectBtn');
  const dropdownMenu = document.getElementById('walletDropdownMenu');
  const copyAddressBtn = document.getElementById('menuCopyAddressBtn');
  const viewEtherscanLink = document.getElementById('menuViewEtherscanLink');
  const disconnectBtn = document.getElementById('menuDisconnectBtn');
  const networkRibbon = document.getElementById('networkRibbon');

  // Network Switch on Ribbon Click (if wrong network)
  if (networkRibbon) {
    networkRibbon.addEventListener('click', async () => {
      if (networkRibbon.classList.contains('wrong-network')) {
        await checkAndSwitchNetwork();
      }
    });
  }

  // Wallet Connect / Dropdown toggle
  if (walletBtn) {
    walletBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!isWalletConnected()) {
        await connectWallet();
      } else {
        dropdownMenu.classList.toggle('show');
      }
    });
  }

  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (dropdownMenu && !dropdownMenu.contains(e.target) && e.target !== walletBtn) {
      dropdownMenu.classList.remove('show');
    }
  });

  // Copy Address
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener('click', () => {
      const addr = getCurrentAccount();
      if (addr) {
        navigator.clipboard.writeText(addr);
        showToast('Address copied to clipboard!', 'success');
      }
      dropdownMenu.classList.remove('show');
    });
  }

  // Disconnect
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      disconnectWallet();
      dropdownMenu.classList.remove('show');
    });
  }

  // Listen to wallet state changes
  window.addEventListener('walletStateChanged', async (e) => {
    const { account, connected } = e.detail;
    updateWalletButtonState(account, connected);
    await updateNetworkRibbonState();
  });

  // More Dropdown toggle
  const moreWrapper = document.getElementById('navMoreWrapper');
  const moreBtn = document.getElementById('navMoreBtn');
  const moreMenu = document.getElementById('navMoreMenu');
  if (moreWrapper && moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = moreWrapper.classList.toggle('open');
      moreBtn.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!moreWrapper.contains(e.target)) {
        moreWrapper.classList.remove('open');
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && moreWrapper.classList.contains('open')) {
        moreWrapper.classList.remove('open');
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    });
    moreMenu?.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        moreWrapper.classList.remove('open');
        moreBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Mobile Hamburger toggle
  const hamburgerBtn = document.getElementById('navHamburgerBtn');
  const mobileDrawer = document.getElementById('mobileNavDrawer');
  if (hamburgerBtn && mobileDrawer) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileDrawer.classList.toggle('open');
      hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
      mobileDrawer.setAttribute('aria-hidden', String(!isOpen));
    });
    document.addEventListener('click', (e) => {
      if (mobileDrawer.classList.contains('open') && !mobileDrawer.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        mobileDrawer.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileDrawer.classList.contains('open')) {
        mobileDrawer.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      }
    });
    mobileDrawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      });
    });
  }
}

export async function updateWalletButtonState(account, connected) {
  const walletBtn = document.getElementById('walletConnectBtn');
  const viewEtherscanLink = document.getElementById('menuViewEtherscanLink');
  const menuXpStatus = document.getElementById('menuXpStatus');
  const menuBalanceVal = document.getElementById('menuBalanceVal');
  if (!walletBtn) return;

  if (connected && account) {
    const balance = await getAccountBalance(account);
    const shortAddr = shortenAddress(account);
    const avatarSvg = createIdenticonSvg(account, 24);

    // Calculate level from local cache or default Level 1
    const userXp = Number(localStorage.getItem(`multipoll_xp_${account.toLowerCase()}`)) || 0;
    const userLevel = Math.floor(userXp / 100) + 1;

    walletBtn.className = 'btn-wallet-connected';
    walletBtn.innerHTML = `
      <div class="wallet-avatar-wrap">
        ${avatarSvg}
        <span class="wallet-avatar-lvl" title="Level ${userLevel}">L${userLevel}</span>
      </div>
      <span class="wallet-addr-truncated">${shortAddr}</span>
      <svg class="wallet-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    if (menuBalanceVal) {
      menuBalanceVal.textContent = `${balance} SEP`;
    }
    if (viewEtherscanLink) {
      viewEtherscanLink.href = `https://sepolia.etherscan.io/address/${account}`;
    }
    if (menuXpStatus) {
      menuXpStatus.textContent = `Level ${userLevel} • ${userXp} XP`;
    }
  } else {
    walletBtn.className = 'btn-wallet-connect';
    walletBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path>
        <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path>
        <circle cx="18" cy="16" r="2"></circle>
      </svg>
      <span>Connect Wallet</span>
    `;
    if (menuBalanceVal) {
      menuBalanceVal.textContent = `0.000 SEP`;
    }
    if (menuXpStatus) {
      menuXpStatus.textContent = `Level 1 • 0 XP`;
    }
  }
}

async function updateNetworkRibbonState() {
  const ribbon = document.getElementById('networkRibbon');
  const ribbonText = document.getElementById('networkRibbonText');
  if (!ribbon || !ribbonText) return;

  const isSepolia = await isCorrectNetwork();
  if (isSepolia) {
    ribbon.className = 'network-ribbon';
    ribbonText.textContent = 'SEPOLIA';
    ribbon.title = 'Connected to Ethereum Sepolia';
  } else {
    ribbon.className = 'network-ribbon wrong-network';
    ribbonText.textContent = 'SWITCH TO SEPOLIA';
    ribbon.title = 'Wrong network! Click to switch to Ethereum Sepolia';
  }
}

async function updateNetworkStatusPanel() {
  const blockEl = document.getElementById('footerBlockNumber');
  const statusEl = document.getElementById('footerReachableStatus');
  const dotEl = document.getElementById('footerStatusDot');
  const gasEl = document.getElementById('footerGasPrice');

  const status = await getNetworkStatus();

  if (blockEl && status.blockNumber) {
    blockEl.textContent = `#${status.blockNumber.toLocaleString()}`;
  }

  if (gasEl && status.gasPriceGwei) {
    gasEl.textContent = `${status.gasPriceGwei} Gwei`;
  }

  if (statusEl && dotEl) {
    if (status.reachable) {
      statusEl.textContent = 'Reachable';
      statusEl.style.color = '#00D26A';
      dotEl.style.color = '#00D26A';
    } else {
      statusEl.textContent = 'Degraded';
      statusEl.style.color = 'var(--accent-red)';
      dotEl.style.color = 'var(--accent-red)';
    }
  }
}

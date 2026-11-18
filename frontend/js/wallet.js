/**
 * MULTIPOLL • js/wallet.js
 * Single Source of Truth for Web3 Wallet State
 * Implements EIP-6963 Multi-Injected Provider Discovery, Silent Reconnect, and Subscriber Pattern
 */

import { SEPOLIA_CHAIN_ID_HEX, SEPOLIA_CHAIN_ID_DEC } from './web3-constants.js';

export const USER_DISCONNECTED_KEY = 'multipoll_user_disconnected';

// Internal state object
export const state = {
  address: null,
  chainId: null,
  status: 'pending', // 'pending' | 'connected' | 'disconnected' | 'wrong_network'
  providerName: null,
  rdns: null,
  isMetaMask: false,
  isBrave: false
};

const subscribers = new Set();
let selectedProvider = null;
const announcedProviders = [];

let resolveReady;
export const ready = new Promise((resolve) => {
  resolveReady = resolve;
});

export function subscribe(callback) {
  if (typeof callback !== 'function') return () => {};
  subscribers.add(callback);
  // Immediate invocation with current state
  try {
    callback({ ...state });
  } catch (err) {
    console.error('wallet.subscribe callback error:', err);
  }
  return () => subscribers.delete(callback);
}

function notifySubscribers() {
  const snapshot = { ...state };
  for (const sub of subscribers) {
    try {
      sub(snapshot);
    } catch (err) {
      console.error('wallet subscriber execution error:', err);
    }
  }
}

export function getSelectedProvider() {
  return selectedProvider;
}

export function getDiscoveredProviders() {
  return announcedProviders.map((ap) => ({
    name: ap.info?.name,
    rdns: ap.info?.rdns,
    uuid: ap.info?.uuid
  }));
}

/**
 * Provider Discovery via EIP-6963 with fallback to window.ethereum.providers / window.ethereum
 */
async function discoverProvider() {
  // 1. Listen for EIP-6963 announcements
  const handleAnnouncement = (event) => {
    if (event?.detail?.provider && event?.detail?.info) {
      if (!announcedProviders.some((p) => p.info.uuid === event.detail.info.uuid)) {
        announcedProviders.push(event.detail);
      }
    }
  };

  window.addEventListener('eip6963:announceProvider', handleAnnouncement);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Wait 300ms for providers to announce themselves
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener('eip6963:announceProvider', handleAnnouncement);

  // 2. Select MetaMask if announced via EIP-6963
  const mmAnnounced = announcedProviders.find(
    (p) => p.info?.rdns === 'io.metamask' || /metamask/i.test(p.info?.name || '')
  );
  if (mmAnnounced) {
    selectedProvider = mmAnnounced.provider;
    state.providerName = mmAnnounced.info.name || 'MetaMask';
    state.rdns = mmAnnounced.info.rdns || 'io.metamask';
    state.isMetaMask = true;
    state.isBrave = Boolean(selectedProvider.isBraveWallet);
    return selectedProvider;
  }

  // If another provider announced via EIP-6963 and no MetaMask, store first
  if (announcedProviders.length > 0) {
    const first = announcedProviders[0];
    selectedProvider = first.provider;
    state.providerName = first.info.name || 'Injected Wallet';
    state.rdns = first.info.rdns || null;
    state.isMetaMask = Boolean(selectedProvider.isMetaMask);
    state.isBrave = Boolean(selectedProvider.isBraveWallet);
    return selectedProvider;
  }

  // 3. Fallback: window.ethereum.providers array (Brave / multi-wallet setups)
  if (typeof window !== 'undefined' && window.ethereum) {
    if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
      // Prioritize pure MetaMask (not Brave Wallet pretending to be MetaMask)
      const pureMetaMask = window.ethereum.providers.find(
        (p) => p.isMetaMask && !p.isBraveWallet
      );
      if (pureMetaMask) {
        selectedProvider = pureMetaMask;
        state.providerName = 'MetaMask';
        state.rdns = 'io.metamask';
        state.isMetaMask = true;
        state.isBrave = false;
        return selectedProvider;
      }

      // Any MetaMask entry
      const anyMM = window.ethereum.providers.find((p) => p.isMetaMask);
      if (anyMM) {
        selectedProvider = anyMM;
        state.providerName = anyMM.isBraveWallet ? 'Brave Wallet (MetaMask Mode)' : 'MetaMask';
        state.isMetaMask = true;
        state.isBrave = Boolean(anyMM.isBraveWallet);
        return selectedProvider;
      }

      // Default to first provider in array
      selectedProvider = window.ethereum.providers[0];
      state.providerName = 'Injected Wallet';
      state.isMetaMask = Boolean(selectedProvider.isMetaMask);
      state.isBrave = Boolean(selectedProvider.isBraveWallet);
      return selectedProvider;
    }

    // Single window.ethereum
    selectedProvider = window.ethereum;
    state.providerName = window.ethereum.isBraveWallet
      ? 'Brave Wallet'
      : window.ethereum.isMetaMask
      ? 'MetaMask'
      : 'Injected Wallet';
    state.isMetaMask = Boolean(window.ethereum.isMetaMask && !window.ethereum.isBraveWallet);
    state.isBrave = Boolean(window.ethereum.isBraveWallet);
    return selectedProvider;
  }

  selectedProvider = null;
  state.providerName = null;
  return null;
}

/**
 * Normalizes chainId to decimal number
 */
function normalizeChainId(cid) {
  if (!cid) return null;
  if (typeof cid === 'number') return cid;
  if (typeof cid === 'string') {
    if (cid.startsWith('0x') || cid.startsWith('0X')) {
      return parseInt(cid, 16);
    }
    return parseInt(cid, 10);
  }
  return null;
}

function updateNetworkStatus(decChainId) {
  state.chainId = decChainId;
  if (!state.address) {
    state.status = 'disconnected';
  } else if (decChainId === SEPOLIA_CHAIN_ID_DEC) {
    state.status = 'connected';
  } else {
    state.status = 'wrong_network';
  }
}

/**
 * Initialize wallet session silently without user prompts
 */
async function initWalletSession() {
  const provider = await discoverProvider();
  if (!provider) {
    state.status = 'disconnected';
    state.address = null;
    state.chainId = null;
    notifySubscribers();
    resolveReady({ ...state });
    return;
  }

  // Setup event listeners on the selected provider
  if (typeof provider.on === 'function') {
    provider.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        state.address = null;
        state.status = 'disconnected';
      } else {
        state.address = accounts[0].toLowerCase();
        localStorage.removeItem(USER_DISCONNECTED_KEY);
        updateNetworkStatus(state.chainId);
      }
      notifySubscribers();
    });

    provider.on('chainChanged', (cid) => {
      const dec = normalizeChainId(cid);
      updateNetworkStatus(dec);
      notifySubscribers();
    });
  }

  // Check if user explicitly disconnected previously
  const userDisconnected = localStorage.getItem(USER_DISCONNECTED_KEY) === 'true';

  try {
    const [accounts, rawChainId] = await Promise.all([
      provider.request({ method: 'eth_accounts' }).catch(() => []),
      provider.request({ method: 'eth_chainId' }).catch(() => null)
    ]);

    const decChainId = normalizeChainId(rawChainId);
    state.chainId = decChainId;

    if (!userDisconnected && accounts && accounts.length > 0) {
      state.address = accounts[0].toLowerCase();
      updateNetworkStatus(decChainId);
    } else {
      state.address = null;
      state.status = 'disconnected';
    }
  } catch (err) {
    console.warn('Silent wallet session restoration error:', err);
    state.address = null;
    state.status = 'disconnected';
  }

  notifySubscribers();
  resolveReady({ ...state });
}

// Start discovery immediately
initWalletSession().catch((err) => {
  console.error('Wallet initialization failed:', err);
  state.status = 'disconnected';
  notifySubscribers();
  resolveReady({ ...state });
});

/**
 * Connect wallet on user request
 */
export async function connect() {
  await ready;
  const provider = selectedProvider || (await discoverProvider());
  if (!provider) {
    throw new Error('No Ethereum wallet found. Please install MetaMask or another Web3 extension.');
  }

  state.status = 'connecting';
  notifySubscribers();

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts selected.');
    }

    const rawChainId = await provider.request({ method: 'eth_chainId' }).catch(() => null);
    const decChainId = normalizeChainId(rawChainId);

    state.address = accounts[0].toLowerCase();
    state.chainId = decChainId;
    localStorage.removeItem(USER_DISCONNECTED_KEY);

    updateNetworkStatus(decChainId);
    notifySubscribers();

    // If on wrong network, prompt switch
    if (decChainId !== SEPOLIA_CHAIN_ID_DEC) {
      await switchToSepolia();
    }

    return { ...state };
  } catch (err) {
    state.status = state.address ? 'connected' : 'disconnected';
    notifySubscribers();
    throw err;
  }
}

/**
 * Disconnect wallet (UI-level only)
 */
export function disconnect() {
  state.address = null;
  state.status = 'disconnected';
  localStorage.setItem(USER_DISCONNECTED_KEY, 'true');
  notifySubscribers();
}

/**
 * Switch wallet network to Sepolia
 */
export async function switchToSepolia() {
  const provider = selectedProvider;
  if (!provider) throw new Error('No wallet provider available.');

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
    });
    const raw = await provider.request({ method: 'eth_chainId' });
    updateNetworkStatus(normalizeChainId(raw));
    notifySubscribers();
    return true;
  } catch (switchError) {
    if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: 'Ethereum Sepolia',
            nativeCurrency: { name: 'Sepolia ETH', symbol: 'SEP', decimals: 18 },
            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
            blockExplorerUrls: ['https://sepolia.etherscan.io']
          }
        ]
      });
      const raw = await provider.request({ method: 'eth_chainId' });
      updateNetworkStatus(normalizeChainId(raw));
      notifySubscribers();
      return true;
    }
    throw switchError;
  }
}

/**
 * Returns an ethers BrowserProvider wrapping the active wallet
 */
export function getWalletBrowserProvider() {
  if (!selectedProvider || !window.ethers) return null;
  return new window.ethers.BrowserProvider(selectedProvider);
}

/**
 * Returns an ethers Signer for write transactions
 */
export async function getSigner() {
  await ready;
  const browserProvider = getWalletBrowserProvider();
  if (!browserProvider) {
    throw new Error('Please connect your Web3 wallet first.');
  }
  return await browserProvider.getSigner();
}

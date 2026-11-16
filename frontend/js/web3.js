/**
 * MULTIPOLL • js/web3.js
 * Read & Write Providers, Wallet Persistence, Sepolia Switcher, Event Queries, Telemetry
 */

import { CONTRACT_ADDRESS, CONTRACT_ABI, VERIFIED, READ_RPC_URLS } from '../contract-config.js';
import { showToast, parseContractError } from './ui.js';

export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';
export const SEPOLIA_CHAIN_ID_DEC = 11155111;
export const CONTRACT_DEPLOY_BLOCK = 12141000;

// Default Sepolia endpoints fallback list
const FALLBACK_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://rpc2.sepolia.org'
];

let publicProvider = null;
let currentAccount = null;
let currentChainId = null;

const WALLET_CONNECTED_KEY = 'multipoll_wallet_connected';

/* --------------------------------------------------------------------------
   1. Read Provider & Read Contract (Zero Wallet Required)
   -------------------------------------------------------------------------- */
export function getReadProvider() {
  if (publicProvider) return publicProvider;

  const ethers = window.ethers;
  if (!ethers) {
    console.error('Ethers.js library not loaded from CDN.');
    return null;
  }

  const endpoints = (Array.isArray(READ_RPC_URLS) && READ_RPC_URLS.length > 0)
    ? READ_RPC_URLS
    : FALLBACK_RPC_URLS;

  try {
    if (ethers.FallbackProvider && endpoints.length > 1) {
      const network = { name: 'sepolia', chainId: SEPOLIA_CHAIN_ID_DEC };
      const configs = endpoints.map((url, idx) => ({
        provider: new ethers.JsonRpcProvider(url, network, { staticNetwork: true }),
        priority: idx + 1,
        weight: 1,
        stallTimeout: 2500
      }));
      publicProvider = new ethers.FallbackProvider(configs, 1);
    } else {
      publicProvider = new ethers.JsonRpcProvider(endpoints[0], {
        name: 'sepolia',
        chainId: SEPOLIA_CHAIN_ID_DEC
      }, { staticNetwork: true });
    }
  } catch (err) {
    console.warn('FallbackProvider error, using single JsonRpcProvider:', err);
    publicProvider = new ethers.JsonRpcProvider(endpoints[0], {
      name: 'sepolia',
      chainId: SEPOLIA_CHAIN_ID_DEC
    }, { staticNetwork: true });
  }

  return publicProvider;
}

export function getReadContract() {
  const provider = getReadProvider();
  if (!provider || !window.ethers) return null;
  return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

/* --------------------------------------------------------------------------
   2. Write Provider & Wallet Connection
   -------------------------------------------------------------------------- */
export function getBrowserProvider() {
  if (typeof window.ethereum !== 'undefined' && window.ethers) {
    return new window.ethers.BrowserProvider(window.ethereum);
  }
  return null;
}

export async function getSigner() {
  const provider = getBrowserProvider();
  if (!provider) {
    throw new Error('MetaMask or Web3 wallet is not installed.');
  }
  return await provider.getSigner();
}

export async function getWriteContract() {
  const signer = await getSigner();
  return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

export function getCurrentAccount() {
  return currentAccount;
}

export function isWalletConnected() {
  return Boolean(currentAccount);
}

export async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showToast('MetaMask is not installed. Please install MetaMask to interact with the blockchain.', 'error');
    window.open('https://metamask.io/download/', '_blank');
    return null;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts authorized.');
    }

    currentAccount = accounts[0];
    localStorage.setItem(WALLET_CONNECTED_KEY, 'true');

    // Check network
    await checkAndSwitchNetwork();

    dispatchWalletEvent();
    showToast(`Connected: ${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`, 'success');
    return currentAccount;
  } catch (err) {
    console.error('Wallet connection error:', err);
    showToast(parseContractError(err), 'error');
    return null;
  }
}

export function disconnectWallet() {
  currentAccount = null;
  localStorage.removeItem(WALLET_CONNECTED_KEY);
  dispatchWalletEvent();
  showToast('Wallet disconnected.', 'info');
}

export async function getAccountBalance(address) {
  if (!address || !window.ethers) return '0.000';
  try {
    const provider = getReadProvider();
    const balance = await provider.getBalance(address);
    const eth = window.ethers.formatEther(balance);
    return Number(eth).toFixed(3);
  } catch (err) {
    console.warn('Failed to fetch balance:', err);
    return '0.000';
  }
}

/* --------------------------------------------------------------------------
   3. Network Checker & Switcher
   -------------------------------------------------------------------------- */
export async function checkAndSwitchNetwork() {
  if (typeof window.ethereum === 'undefined') return true;

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    currentChainId = chainId;

    if (chainId.toLowerCase() !== SEPOLIA_CHAIN_ID_HEX) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
        });
        currentChainId = SEPOLIA_CHAIN_ID_HEX;
        return true;
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
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
          currentChainId = SEPOLIA_CHAIN_ID_HEX;
          return true;
        }
        throw switchError;
      }
    }
    return true;
  } catch (err) {
    console.warn('Failed to switch network:', err);
    showToast('Please switch MetaMask to Ethereum Sepolia network.', 'error');
    return false;
  }
}

export async function isCorrectNetwork() {
  if (typeof window.ethereum === 'undefined') return true;
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    return chainId.toLowerCase() === SEPOLIA_CHAIN_ID_HEX;
  } catch {
    return true;
  }
}

/* --------------------------------------------------------------------------
   4. Auto-Reconnect & Event Listeners
   -------------------------------------------------------------------------- */
export async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
    const wasConnected = localStorage.getItem(WALLET_CONNECTED_KEY) === 'true';
    if (wasConnected) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          currentAccount = accounts[0];
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          currentChainId = chainId;
        } else {
          localStorage.removeItem(WALLET_CONNECTED_KEY);
        }
      } catch (err) {
        console.warn('Silent reconnect failed:', err);
      }
    }

    window.ethereum.on('accountsChanged', (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
      } else {
        currentAccount = accounts[0];
        localStorage.setItem(WALLET_CONNECTED_KEY, 'true');
        dispatchWalletEvent();
        showToast(`Active Account: ${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`, 'info');
      }
    });

    window.ethereum.on('chainChanged', (chainId) => {
      currentChainId = chainId;
      window.location.reload();
    });
  }

  dispatchWalletEvent();
}

function dispatchWalletEvent() {
  window.dispatchEvent(
    new CustomEvent('walletStateChanged', {
      detail: {
        account: currentAccount,
        connected: Boolean(currentAccount),
        chainId: currentChainId
      }
    })
  );
}

/* --------------------------------------------------------------------------
   5. Network Status Telemetry (Block Number + Gas Price in Gwei)
   -------------------------------------------------------------------------- */
export async function getNetworkStatus() {
  try {
    const provider = getReadProvider();
    if (!provider) return { reachable: false, blockNumber: 0, gasPriceGwei: '0.10' };

    const [blockNumber, feeData] = await Promise.all([
      provider.getBlockNumber(),
      provider.getFeeData().catch(() => null)
    ]);

    const contract = getReadContract();
    let reachable = false;

    if (contract) {
      try {
        await contract.getPollCount();
        reachable = true;
      } catch (e) {
        console.warn('Contract ping failed:', e);
      }
    }

    let gasPriceGwei = '0.10';
    if (feeData && feeData.gasPrice && window.ethers) {
      const gweiVal = Number(window.ethers.formatUnits(feeData.gasPrice, 'gwei'));
      if (gweiVal < 0.01) {
        gasPriceGwei = '< 0.01';
      } else {
        gasPriceGwei = gweiVal.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      }
    }

    return {
      reachable,
      blockNumber,
      gasPriceGwei,
      contractAddress: CONTRACT_ADDRESS,
      isVerified: Boolean(VERIFIED)
    };
  } catch (err) {
    console.warn('Network telemetry error:', err);
    return {
      reachable: false,
      blockNumber: 0,
      gasPriceGwei: '0.10',
      contractAddress: CONTRACT_ADDRESS,
      isVerified: Boolean(VERIFIED)
    };
  }
}

/* --------------------------------------------------------------------------
   6. Safe Paginated Event Log Queries
   -------------------------------------------------------------------------- */
export async function queryContractEvents(filter, startBlock = CONTRACT_DEPLOY_BLOCK, endBlock = null, chunkSize = 3500) {
  const contract = getReadContract();
  const provider = getReadProvider();
  if (!contract || !provider) return [];

  try {
    const latestBlock = endBlock !== null ? endBlock : await provider.getBlockNumber();
    const from = Math.max(startBlock, CONTRACT_DEPLOY_BLOCK);

    // If within single chunk range, direct query
    if (latestBlock - from <= chunkSize) {
      return await contract.queryFilter(filter, from, latestBlock);
    }

    // Chunked pagination
    const allEvents = [];
    for (let b = from; b <= latestBlock; b += chunkSize) {
      const chunkEnd = Math.min(b + chunkSize - 1, latestBlock);
      try {
        const events = await contract.queryFilter(filter, b, chunkEnd);
        allEvents.push(...events);
      } catch (chunkErr) {
        console.warn(`Chunk ${b}-${chunkEnd} error:`, chunkErr);
      }
    }
    return allEvents;
  } catch (err) {
    console.error('Error querying events paginated:', err);
    return [];
  }
}

/* --------------------------------------------------------------------------
   7. Transaction Receipt & Verification
   -------------------------------------------------------------------------- */
export async function getTransactionReceipt(txHash) {
  const provider = getReadProvider();
  if (!provider) return null;
  return await provider.getTransactionReceipt(txHash);
}

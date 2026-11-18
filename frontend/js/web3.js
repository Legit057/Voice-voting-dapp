/**
 * MULTIPOLL • js/web3.js
 * Unified Resilient Read & Write Layer
 * Shared Read Provider with automatic failover, static network, batchMaxCount: 1, and wallet write integration
 */

import { CONTRACT_ADDRESS, CONTRACT_ABI, VERIFIED, READ_RPC_URLS, DEPLOY_BLOCK } from '../contract-config.js';
import { SEPOLIA_CHAIN_ID_DEC, SEPOLIA_CHAIN_ID_HEX } from './web3-constants.js';
import * as wallet from './wallet.js';

export { SEPOLIA_CHAIN_ID_DEC, SEPOLIA_CHAIN_ID_HEX };
export const CONTRACT_DEPLOY_BLOCK = typeof DEPLOY_BLOCK === 'number' ? DEPLOY_BLOCK : 12141068;

// Fallback list if config is missing or empty
const DEFAULT_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
  'https://gateway.tenderly.co/public/sepolia'
];

// Cleaned endpoints: filter out placeholders, invalid URLs, or duplicates
export const validRpcUrls = (() => {
  const list = Array.isArray(READ_RPC_URLS) && READ_RPC_URLS.length > 0 ? READ_RPC_URLS : DEFAULT_RPC_URLS;
  const cleaned = [];
  for (const u of list) {
    if (!u || typeof u !== 'string') continue;
    if (u.includes('YOUR_API_KEY') || u.includes('<key>') || u.includes('undefined')) continue;
    if (!u.startsWith('http://') && !u.startsWith('https://')) continue;
    if (!cleaned.includes(u)) cleaned.push(u);
  }
  return cleaned.length > 0 ? cleaned : DEFAULT_RPC_URLS;
})();

let activeRpcIndex = 0;
let activeProvider = null;
let initPromise = null;

// Telemetry & Diagnostic state shared with debug.js
export const diagnosticReport = {
  activeEndpoint: validRpcUrls[0],
  startupChecks: {
    chainId: { pass: false, val: null, ms: 0 },
    block: { pass: false, val: null, ms: 0 },
    getCode: { pass: false, val: null, ms: 0 },
    getPollCount: { pass: false, val: null, ms: 0 },
    getPolls: { pass: false, val: null, ms: 0 }
  },
  failingChecks: [],
  overallPass: false
};

function createEndpointProvider(url, timeoutMs = 5000) {
  const ethers = window.ethers;
  if (!ethers) return null;
  const req = new ethers.FetchRequest(url);
  req.timeout = timeoutMs;
  return new ethers.JsonRpcProvider(
    req,
    { name: 'sepolia', chainId: SEPOLIA_CHAIN_ID_DEC },
    { staticNetwork: true, batchMaxCount: 1 }
  );
}

/**
 * Health check on an endpoint
 */
async function checkEndpointHealth(provider) {
  const result = { chainId: false, block: 0, code: false };
  try {
    const [net, blk, code] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
      provider.getCode(CONTRACT_ADDRESS)
    ]);
    result.chainId = Number(net.chainId) === SEPOLIA_CHAIN_ID_DEC;
    result.block = blk;
    result.code = Boolean(code && code !== '0x');
    return result;
  } catch (err) {
    return result;
  }
}

/**
 * Performs startup health check across READ_RPC_URLS in order.
 * Picks the first healthy endpoint.
 */
export async function initReadProvider() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const ethers = window.ethers;
    if (!ethers) {
      console.error('ethers.js not loaded in window');
      return null;
    }

    let chosenProvider = null;

    for (let i = 0; i < validRpcUrls.length; i++) {
      const url = validRpcUrls[i];
      const p = createEndpointProvider(url, 5000);
      if (!p) continue;

      const t0 = Date.now();
      const health = await checkEndpointHealth(p);
      const elapsed = Date.now() - t0;

      if (health.chainId && health.block > 0 && health.code) {
        activeRpcIndex = i;
        chosenProvider = p;
        activeProvider = p;
        diagnosticReport.activeEndpoint = url;
        diagnosticReport.startupChecks.chainId = { pass: true, val: 11155111, ms: elapsed };
        diagnosticReport.startupChecks.block = { pass: true, val: health.block, ms: elapsed };
        diagnosticReport.startupChecks.getCode = { pass: true, val: 'ok', ms: elapsed };
        break;
      } else {
        console.warn(`RPC endpoint ${url} failed health check:`, health);
      }
    }

    // If none passed, default to first candidate
    if (!chosenProvider) {
      console.warn('All RPC endpoints failed strict health check. Falling back to primary endpoint.');
      activeRpcIndex = 0;
      chosenProvider = createEndpointProvider(validRpcUrls[0], 6000);
      activeProvider = chosenProvider;
      diagnosticReport.activeEndpoint = validRpcUrls[0];
    }

    // Run contract startup checks (getPollCount and getPolls)
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeProvider);
      const t0 = Date.now();
      const count = await contract.getPollCount();
      diagnosticReport.startupChecks.getPollCount = { pass: true, val: Number(count), ms: Date.now() - t0 };

      const t1 = Date.now();
      const sample = await contract.getPolls(0, Math.min(Number(count), 5));
      diagnosticReport.startupChecks.getPolls = { pass: true, val: sample.length, ms: Date.now() - t1 };
      diagnosticReport.overallPass = true;
    } catch (err) {
      console.warn('Contract startup check error:', err);
      diagnosticReport.failingChecks.push(err.message || 'Contract read error');
    }

    return activeProvider;
  })();

  return initPromise;
}

/**
 * Returns the single shared read provider
 */
export function getReadProvider() {
  if (activeProvider) return activeProvider;
  const ethers = window.ethers;
  if (!ethers) return null;

  activeProvider = createEndpointProvider(validRpcUrls[activeRpcIndex], 5000);
  diagnosticReport.activeEndpoint = validRpcUrls[activeRpcIndex];
  initReadProvider().catch(() => {});
  return activeProvider;
}

/**
 * Executes a read call with retry and endpoint failover.
 * If all RPC endpoints fail, falls back to the user's wallet provider if connected to Sepolia.
 */
export async function withReadRetry(callFn) {
  await (initPromise || initReadProvider());

  let lastError = null;
  const startIndex = activeRpcIndex;

  // 1. Try active endpoint, retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callFn(activeProvider);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // 2. Rotate to other configured endpoints
  for (let i = 0; i < validRpcUrls.length; i++) {
    const nextIdx = (startIndex + 1 + i) % validRpcUrls.length;
    if (nextIdx === activeRpcIndex) continue;

    const nextUrl = validRpcUrls[nextIdx];
    const candidate = createEndpointProvider(nextUrl, 5000);
    if (!candidate) continue;

    try {
      const res = await callFn(candidate);
      // Succeeded! Switch activeProvider to this healthy endpoint
      activeRpcIndex = nextIdx;
      activeProvider = candidate;
      diagnosticReport.activeEndpoint = nextUrl;
      return res;
    } catch (candErr) {
      lastError = candErr;
    }
  }

  // 3. Last fallback: connected wallet on Sepolia
  if (wallet.state.status === 'connected' && wallet.state.chainId === SEPOLIA_CHAIN_ID_DEC) {
    const walletBrowserProvider = wallet.getWalletBrowserProvider();
    if (walletBrowserProvider) {
      try {
        console.info('Using connected wallet as final read fallback');
        return await callFn(walletBrowserProvider);
      } catch (walletErr) {
        lastError = walletErr;
      }
    }
  }

  throw lastError || new Error('All read providers failed.');
}

/**
 * Returns a Contract instance bound to the shared read provider
 */
export function getReadContract() {
  const provider = getReadProvider();
  if (!provider || !window.ethers) return null;
  return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

/**
 * Returns a Contract instance bound to the active wallet signer for write calls
 */
export async function getWriteContract() {
  const signer = await wallet.getSigner();
  return new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/**
 * Fetches account balance via read provider
 */
export async function getAccountBalance(address) {
  if (!address || !window.ethers) return '0.000';
  try {
    const balance = await withReadRetry((p) => p.getBalance(address));
    const eth = window.ethers.formatEther(balance);
    return Number(eth).toFixed(3);
  } catch (err) {
    console.warn('Failed to fetch balance:', err);
    return '0.000';
  }
}

/**
 * Network Status Telemetry for Footer
 * Supports cheap fast checks (block number and fee data) every 15s,
 * and deep health checks (chainId, contract getCode, getPollCount) every 60s.
 */
export async function getNetworkStatus(options = {}) {
  const isFull = Boolean(options.full);
  const result = {
    reachable: false,
    blockNumber: 0,
    gasPriceGwei: '0.10',
    contractAddress: CONTRACT_ADDRESS,
    isVerified: Boolean(VERIFIED),
    statusText: 'Degraded',
    failingCheck: null,
    gasIsHigh: false,
    isFullCheck: isFull
  };

  try {
    const provider = getReadProvider();
    if (!provider) {
      result.failingCheck = 'network unreachable';
      return result;
    }

    // 1. Cheap calls: block number and fee data (cheap & fast)
    let blockNumber = 0;
    let feeData = null;

    try {
      blockNumber = await withReadRetry((p) => p.getBlockNumber());
    } catch (err) {
      result.failingCheck = 'network unreachable';
      return result;
    }

    try {
      feeData = await withReadRetry((p) => p.getFeeData());
    } catch {
      // Fee data failure is non-fatal if block number succeeded
    }

    result.blockNumber = Number(blockNumber) || 0;
    if (result.blockNumber === 0) {
      result.failingCheck = 'network unreachable';
      return result;
    }

    // Format gas price in neutral format (< 0.01 Gwei for tiny values)
    if (feeData && feeData.gasPrice && window.ethers) {
      const gweiVal = Number(window.ethers.formatUnits(feeData.gasPrice, 'gwei'));
      if (gweiVal < 0.01) {
        result.gasPriceGwei = '< 0.01';
      } else {
        result.gasPriceGwei = gweiVal.toFixed(2);
      }
      if (gweiVal > 100) {
        result.gasIsHigh = true;
      }
    } else {
      result.gasPriceGwei = '< 0.01';
    }

    // If cheap telemetry only, verify reachability based on valid block number
    if (!isFull) {
      result.reachable = true;
      result.statusText = 'Operational';
      result.failingCheck = null;
      return result;
    }

    // 2. Full health check: chainId, getCode of the contract, getPollCount
    // A. Verify chainId (must be Sepolia: 11155111)
    try {
      const net = await withReadRetry((p) => p.getNetwork());
      const chainId = Number(net?.chainId);
      if (chainId !== 11155111) {
        result.failingCheck = 'network unreachable';
        result.statusText = 'Degraded';
        return result;
      }
    } catch {
      result.failingCheck = 'network unreachable';
      result.statusText = 'Degraded';
      return result;
    }

    // B. Verify bytecode at CONTRACT_ADDRESS
    try {
      const code = await withReadRetry((p) => p.getCode(CONTRACT_ADDRESS));
      if (!code || code === '0x' || code === '0x0') {
        result.failingCheck = 'contract not found at this address';
        result.statusText = 'Degraded';
        return result;
      }
    } catch {
      result.failingCheck = 'contract not found at this address';
      result.statusText = 'Degraded';
      return result;
    }

    // C. Verify contract read call: getPollCount()
    try {
      await withReadRetry((p) => {
        const c = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
        return c.getPollCount();
      });
    } catch {
      result.failingCheck = 'read call failed';
      result.statusText = 'Degraded';
      return result;
    }

    // All full health checks passed
    result.reachable = true;
    result.statusText = 'Operational';
    result.failingCheck = null;
    return result;
  } catch (err) {
    result.reachable = false;
    result.statusText = 'Degraded';
    result.failingCheck = result.failingCheck || 'network unreachable';
    return result;
  }
}

/**
 * Safe Paginated Event Log Queries in Chunks <= 2000 blocks starting from DEPLOY_BLOCK
 */
export async function queryContractEvents(filter, startBlock = CONTRACT_DEPLOY_BLOCK, endBlock = null, chunkSize = 1500) {
  const safeChunkSize = Math.min(chunkSize, 2000);
  const provider = getReadProvider();
  if (!provider) return [];

  try {
    const latestBlock = endBlock !== null ? endBlock : await withReadRetry((p) => p.getBlockNumber());
    const from = Math.max(startBlock, CONTRACT_DEPLOY_BLOCK);

    if (from > latestBlock) return [];

    const allEvents = [];

    for (let b = from; b <= latestBlock; b += safeChunkSize) {
      const chunkEnd = Math.min(b + safeChunkSize - 1, latestBlock);

      // Attempt chunk query with retry
      let chunkEvents = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          chunkEvents = await withReadRetry((p) => {
            const c = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p);
            return c.queryFilter(filter, b, chunkEnd);
          });
          break;
        } catch (err) {
          if (attempt === 1) {
            console.warn(`Query logs chunk ${b}-${chunkEnd} failed after retry:`, err);
          }
        }
      }

      if (Array.isArray(chunkEvents)) {
        allEvents.push(...chunkEvents);
      }
    }

    return allEvents;
  } catch (err) {
    console.error('Error querying events paginated:', err);
    return [];
  }
}

/**
 * Transaction Receipt lookup with retry
 */
export async function getTransactionReceipt(txHash) {
  try {
    return await withReadRetry((p) => p.getTransactionReceipt(txHash));
  } catch (err) {
    console.error('getTransactionReceipt error:', err);
    return null;
  }
}

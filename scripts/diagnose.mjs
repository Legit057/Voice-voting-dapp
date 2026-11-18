import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, READ_RPC_URLS } from '../frontend/contract-config.js';

function maskUrl(url) {
  if (!url) return '';
  return url.replace(/([a-zA-Z0-9_-]{20,})/g, (m) => m.slice(0, 4) + '...' + m.slice(-4));
}

const ORIGIN = 'https://voice-voting-dapp.vercel.app';
const SEPOLIA_NETWORK = { name: 'sepolia', chainId: 11155111 };

function createReq(url, timeoutMs = 4000) {
  const req = new ethers.FetchRequest(url);
  req.setHeader('Origin', ORIGIN);
  req.timeout = timeoutMs;
  return req;
}

async function testProvider(name, provider) {
  console.log(`\n==================================================`);
  console.log(`TESTING: ${maskUrl(name)}`);
  console.log(`==================================================`);

  let currentBlock = 0;
  // 1. getBlockNumber
  try {
    const t0 = Date.now();
    currentBlock = await provider.getBlockNumber();
    console.log(`[PASS] getBlockNumber: ${currentBlock} (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(`[FAIL] getBlockNumber: ${err.shortMessage || err.message || err}`);
  }

  // 2. getCode
  try {
    const t0 = Date.now();
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code && code !== '0x') {
      console.log(`[PASS] getCode: ${code.length} chars bytecode (${Date.now() - t0}ms)`);
    } else {
      console.log(`[FAIL] getCode: code is 0x (no contract at ${CONTRACT_ADDRESS})`);
    }
  } catch (err) {
    console.log(`[FAIL] getCode: ${err.shortMessage || err.message || err}`);
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  // 3. getPollCount
  try {
    const t0 = Date.now();
    const count = await contract.getPollCount();
    console.log(`[PASS] contract.getPollCount(): ${count.toString()} (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(`[FAIL] contract.getPollCount(): ${err.shortMessage || err.message || err}`);
  }

  // 4. getPolls(0, 10)
  try {
    const t0 = Date.now();
    const polls = await contract.getPolls(0, 10);
    console.log(`[PASS] contract.getPolls(0, 10): returned ${polls.length} polls (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(`[FAIL] contract.getPolls(0, 10): ${err.shortMessage || err.message || err}`);
  }

  // 5. getAllPolls()
  if (typeof contract.getAllPolls === 'function') {
    try {
      const t0 = Date.now();
      const allPolls = await contract.getAllPolls();
      console.log(`[PASS] contract.getAllPolls(): returned ${allPolls.length} polls (${Date.now() - t0}ms)`);
    } catch (err) {
      console.log(`[FAIL] contract.getAllPolls(): ${err.shortMessage || err.message || err}`);
    }
  } else {
    console.log(`[SKIP] contract.getAllPolls: function not in ABI`);
  }

  // 6. getLogs over last 1000 blocks
  if (currentBlock > 0) {
    try {
      const t0 = Date.now();
      const fromBlock = Math.max(0, currentBlock - 1000);
      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock,
        toBlock: currentBlock
      });
      console.log(`[PASS] provider.getLogs(last 1000 blocks [${fromBlock}-${currentBlock}]): ${logs.length} logs (${Date.now() - t0}ms)`);
    } catch (err) {
      console.log(`[FAIL] provider.getLogs: ${err.shortMessage || err.message || err}`);
    }
  }
}

async function runDiagnosis() {
  console.log(`CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
  console.log(`Configured READ_RPC_URLS (${READ_RPC_URLS.length}):`);
  READ_RPC_URLS.forEach((u, i) => console.log(`  ${i + 1}. ${maskUrl(u)}`));

  // Also include the two broken legacy URLs to demonstrate why they failed in production
  const testEndpoints = [
    ...READ_RPC_URLS,
    "https://rpc.sepolia.org",
    "https://rpc2.sepolia.org"
  ];

  // Test each endpoint individually
  for (const url of testEndpoints) {
    try {
      const p = new ethers.JsonRpcProvider(createReq(url, 3500), SEPOLIA_NETWORK, { staticNetwork: true });
      await testProvider(url, p);
    } catch (e) {
      console.log(`[ERR creating provider for ${maskUrl(url)}]: ${e.message}`);
    }
  }

  // Test FallbackProvider built EXACTLY like frontend/js/web3.js builds it
  console.log(`\n==================================================`);
  console.log(`TESTING FALLBACK PROVIDER (exact replica of old web3.js with old endpoints)`);
  console.log(`==================================================`);
  try {
    const oldEndpoints = [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      "https://rpc2.sepolia.org"
    ];
    const configs = oldEndpoints.map((url, idx) => ({
      provider: new ethers.JsonRpcProvider(createReq(url, 3000), SEPOLIA_NETWORK, { staticNetwork: true }),
      priority: idx + 1,
      weight: 1,
      stallTimeout: 2500
    }));
    const fallback = new ethers.FallbackProvider(configs, 1);
    await testProvider('Old FallbackProvider (quorum 1, stallTimeout 2500)', fallback);
  } catch (err) {
    console.log(`[FAIL creating FallbackProvider]: ${err.message || err}`);
  }

  console.log(`\n==================================================`);
  console.log(`TESTING FALLBACK PROVIDER (with new verified healthy endpoints)`);
  console.log(`==================================================`);
  try {
    const configs = READ_RPC_URLS.map((url, idx) => ({
      provider: new ethers.JsonRpcProvider(createReq(url, 3000), SEPOLIA_NETWORK, { staticNetwork: true, batchMaxCount: 1 }),
      priority: idx + 1,
      weight: 1,
      stallTimeout: 2500
    }));
    // Note: in Ethers v6, FallbackProvider must be passed network as 3rd parameter or network changed error occurs!
    const fallback = new ethers.FallbackProvider(configs, SEPOLIA_NETWORK, { quorum: 1 });
    await testProvider('New FallbackProvider with network specified (quorum 1)', fallback);
  } catch (err) {
    console.log(`[FAIL creating New FallbackProvider]: ${err.message || err}`);
  }
}

runDiagnosis().catch(console.error);

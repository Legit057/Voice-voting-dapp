const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting seed script for MultiPollVoting...");

  // Read contract address from frontend/contract-config.js
  const configPath = path.join(__dirname, "..", "frontend", "contract-config.js");
  const configContent = fs.readFileSync(configPath, "utf8");
  const addressMatch = configContent.match(/CONTRACT_ADDRESS\s*=\s*"([^"]+)"/);

  if (!addressMatch) {
    throw new Error("Could not find CONTRACT_ADDRESS in frontend/contract-config.js");
  }

  const contractAddress = addressMatch[1];
  console.log("Target Contract Address:", contractAddress);

  const MultiPollVoting = await ethers.getContractFactory("MultiPollVoting");
  const voting = MultiPollVoting.attach(contractAddress);

  const [deployer] = await ethers.getSigners();
  console.log("Seeding with account:", deployer.address);

  // Poll 1: 2-minute quick poll
  console.log("\nCreating Poll 1 (2-minute quick poll)...");
  const tx1 = await voting.createPoll(
    "Will Vitalik release another viral Ethereum rap before block 25M?",
    "High-conviction cultural signal on whether the father of Ethereum drops another lyrical masterclass.",
    ["Yes, pure fire incoming", "No, focused on rollups", "Only on Farcaster audio"],
    2,
    false
  );
  await tx1.wait();
  const pollCount1 = await voting.getPollCount();
  console.log(`Poll 1 Created! Poll ID: ${pollCount1.toString()}`);

  // Poll 2: 1440-minute (1 day) open poll
  console.log("\nCreating Poll 2 (1440-minute open poll)...");
  const tx2 = await voting.createPoll(
    "Official Mascot of Ethereum Sepolia: Who wears the crown?",
    "Every testnet needs a spirit animal to guide gas optimizations through the dark forest.",
    ["Bufficorn with laser eyes", "Gasless Capybara", "EIP-4844 Blobby Goblin"],
    1440,
    false
  );
  await tx2.wait();
  const pollCount2 = await voting.getPollCount();
  console.log(`Poll 2 Created! Poll ID: ${pollCount2.toString()}`);

  // Poll 3: 1440-minute (1 day) blind poll
  console.log("\nCreating Poll 3 (1440-minute blind poll)...");
  const tx3 = await voting.createPoll(
    "Secret Ballot: Which L2 will process the most TPS in 2027?",
    "Tallies remain completely hidden on-chain until the countdown expires to prevent herd mentality.",
    ["Arbitrum One", "Optimism Superchain", "Base Megachain"],
    1440,
    true
  );
  await tx3.wait();
  const pollCount3 = await voting.getPollCount();
  console.log(`Poll 3 Created! Poll ID: ${pollCount3.toString()}`);

  console.log("\n====================================================");
  console.log("Seed complete! Demo Poll IDs created:");
  console.log(`1. Poll ID: ${pollCount1.toString()} (2-minute quick poll)`);
  console.log(`2. Poll ID: ${pollCount2.toString()} (1440-minute open poll)`);
  console.log(`3. Poll ID: ${pollCount3.toString()} (1440-minute blind poll)`);
  console.log("====================================================");
}

main().catch((error) => {
  console.error("Seed script failed:", error);
  process.exitCode = 1;
});

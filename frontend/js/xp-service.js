/**
 * MULTIPOLL • js/xp-service.js
 * On-Chain Activity XP & Leaderboard Engine:
 * 1 Vote = 10 XP, 1 Poll Created = 25 XP, Level = floor(XP / 100) + 1
 */

import { getReadContract, queryContractEvents, CONTRACT_DEPLOY_BLOCK } from './web3.js';

export async function fetchLeaderboardStats() {
  const contract = getReadContract();
  if (!contract) return { topVoters: [], topCreators: [], userStats: {} };

  const statsMap = {}; // address -> { votes: 0, polls: 0, xp: 0, level: 1, streak: 1 }

  const ensureEntry = (addr) => {
    const clean = addr.toLowerCase();
    if (!statsMap[clean]) {
      statsMap[clean] = {
        address: addr,
        votes: 0,
        polls: 0,
        xp: 0,
        level: 1,
        streak: 1
      };
    }
    return statsMap[clean];
  };

  try {
    // 1. Query PollCreated events
    const pollCreatedEvents = await queryContractEvents(contract.filters.PollCreated(), CONTRACT_DEPLOY_BLOCK);
    pollCreatedEvents.forEach((ev) => {
      const creator = ev.args.creator;
      if (creator) {
        const entry = ensureEntry(creator);
        entry.polls += 1;
        entry.xp += 25;
      }
    });

    // 2. Query VoteCast events
    const voteCastEvents = await queryContractEvents(contract.filters.VoteCast(), CONTRACT_DEPLOY_BLOCK);
    voteCastEvents.forEach((ev) => {
      const voter = ev.args.voter;
      if (voter) {
        const entry = ensureEntry(voter);
        entry.votes += 1;
        entry.xp += 10;
      }
    });

    // Compute levels & streaks
    Object.values(statsMap).forEach((entry) => {
      entry.level = Math.floor(entry.xp / 100) + 1;
      entry.streak = entry.votes > 0 ? Math.min(entry.votes, 7) : 0;
      // Cache current user's XP if match
      localStorage.setItem(`multipoll_xp_${entry.address.toLowerCase()}`, entry.xp);
    });

    // Sort Top Voters
    const topVoters = Object.values(statsMap)
      .filter(u => u.votes > 0)
      .sort((a, b) => b.votes - a.votes || b.xp - a.xp);

    // Sort Top Creators
    const topCreators = Object.values(statsMap)
      .filter(u => u.polls > 0)
      .sort((a, b) => b.polls - a.polls || b.xp - a.xp);

    return {
      topVoters,
      topCreators,
      allStats: statsMap
    };
  } catch (err) {
    console.warn('Failed to load leaderboard stats from event logs:', err);
    return { topVoters: [], topCreators: [], allStats: {} };
  }
}

export function getUserLevelInfo(address) {
  if (!address) return { xp: 0, level: 1, streak: 0 };
  const clean = address.toLowerCase();
  const xp = Number(localStorage.getItem(`multipoll_xp_${clean}`)) || 0;
  const level = Math.floor(xp / 100) + 1;
  const nextLvlXp = level * 100;
  const progressInLevel = xp % 100;

  return {
    xp,
    level,
    nextLvlXp,
    progressInLevel
  };
}

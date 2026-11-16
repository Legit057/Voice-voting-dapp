const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MultiPollVoting", function () {
  let MultiPollVoting;
  let voting;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    MultiPollVoting = await ethers.getContractFactory("MultiPollVoting");
    voting = await MultiPollVoting.deploy();
    await voting.waitForDeployment();
  });

  describe("Deployment & Safety Constants", function () {
    it("should initialize with pollCount of 0", async function () {
      expect(await voting.pollCount()).to.equal(0);
    });

    it("should expose correct safety constants", async function () {
      expect(await voting.MAX_OPTIONS()).to.equal(20);
      expect(await voting.MAX_DURATION_MINUTES()).to.equal(43200);
      expect(await voting.MAX_TITLE_LENGTH()).to.equal(120);
      expect(await voting.MAX_OPTION_LENGTH()).to.equal(80);
    });

    it("should return an empty array from getAllPolls initially", async function () {
      const polls = await voting.getAllPolls();
      expect(polls.length).to.equal(0);
    });
  });

  describe("createPoll with Safety Validations", function () {
    it("should create a standard open poll successfully and emit PollCreated", async function () {
      const title = "Favorite Programming Language";
      const description = "Vote for your favorite language for smart contracts";
      const options = ["Solidity", "Rust", "Vyper"];
      const durationInMinutes = 60;
      const isBlind = false;

      const tx = await voting.createPoll(title, description, options, durationInMinutes, isBlind);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedEndTime = block.timestamp + durationInMinutes * 60;

      await expect(tx)
        .to.emit(voting, "PollCreated")
        .withArgs(1, title, description, owner.address, expectedEndTime, isBlind);

      expect(await voting.pollCount()).to.equal(1);

      const poll = await voting.getPoll(1);
      expect(poll.id).to.equal(1);
      expect(poll.title).to.equal(title);
      expect(poll.description).to.equal(description);
      expect(poll.creator).to.equal(owner.address);
      expect(poll.endTime).to.equal(expectedEndTime);
      expect(poll.exists).to.be.true;
      expect(poll.totalVotes).to.equal(0);
      expect(poll.isBlind).to.be.false;
      expect(poll.isCancelled).to.be.false;
      expect(poll.archived).to.be.false;

      const pollOptions = await voting.getPollOptions(1);
      expect(pollOptions.length).to.equal(3);
      expect(pollOptions[0].name).to.equal("Solidity");
      expect(pollOptions[0].voteCount).to.equal(0);
      expect(pollOptions[1].name).to.equal("Rust");
      expect(pollOptions[2].name).to.equal("Vyper");
    });

    it("should create a blind poll successfully", async function () {
      await voting.createPoll("Secret Poll", "Blind vote", ["Option A", "Option B"], 120, true);
      const poll = await voting.getPoll(1);
      expect(poll.isBlind).to.be.true;
    });

    it("should allow creating multiple polls with incrementing IDs", async function () {
      await voting.createPoll("Poll 1", "Desc 1", ["A", "B"], 30, false);
      await voting.connect(addr1).createPoll("Poll 2", "Desc 2", ["Yes", "No", "Abstain"], 120, false);

      expect(await voting.pollCount()).to.equal(2);

      const allPolls = await voting.getAllPolls();
      expect(allPolls.length).to.equal(2);
      expect(allPolls[0].id).to.equal(1);
      expect(allPolls[0].creator).to.equal(owner.address);
      expect(allPolls[1].id).to.equal(2);
      expect(allPolls[1].creator).to.equal(addr1.address);
    });

    it("should revert if title is empty", async function () {
      await expect(
        voting.createPoll("", "Desc", ["A", "B"], 60, false)
      ).to.be.revertedWith("Title cannot be empty");
    });

    it("should revert if title exceeds MAX_TITLE_LENGTH (120 chars)", async function () {
      const longTitle = "A".repeat(121);
      await expect(
        voting.createPoll(longTitle, "Desc", ["A", "B"], 60, false)
      ).to.be.revertedWith("Title exceeds maximum length");
    });

    it("should revert if fewer than 2 options are provided", async function () {
      await expect(
        voting.createPoll("Poll", "Desc", ["Only One"], 60, false)
      ).to.be.revertedWith("Poll must have at least 2 options");

      await expect(
        voting.createPoll("Poll", "Desc", [], 60, false)
      ).to.be.revertedWith("Poll must have at least 2 options");
    });

    it("should revert if options exceed MAX_OPTIONS (20 options)", async function () {
      const twentyOneOptions = Array.from({ length: 21 }, (_, i) => `Opt ${i + 1}`);
      await expect(
        voting.createPoll("Poll", "Desc", twentyOneOptions, 60, false)
      ).to.be.revertedWith("Options exceed maximum limit");
    });

    it("should revert if duration is 0", async function () {
      await expect(
        voting.createPoll("Poll", "Desc", ["A", "B"], 0, false)
      ).to.be.revertedWith("Duration must be greater than 0");
    });

    it("should revert if duration exceeds MAX_DURATION_MINUTES (43200)", async function () {
      await expect(
        voting.createPoll("Poll", "Desc", ["A", "B"], 43201, false)
      ).to.be.revertedWith("Duration exceeds maximum limit");
    });

    it("should revert if any option name is empty", async function () {
      await expect(
        voting.createPoll("Poll", "Desc", ["A", ""], 60, false)
      ).to.be.revertedWith("Option name cannot be empty");
    });

    it("should revert if any option name exceeds MAX_OPTION_LENGTH (80 chars)", async function () {
      const longOption = "O".repeat(81);
      await expect(
        voting.createPoll("Poll", "Desc", ["A", longOption], 60, false)
      ).to.be.revertedWith("Option name exceeds maximum length");
    });
  });

  describe("Voting & Double-Vote Prevention", function () {
    const title = "Blockchain Consensus";
    const description = "Select preferred consensus";
    const options = ["Proof of Stake", "Proof of Work", "Proof of Authority"];
    const durationInMinutes = 60;

    beforeEach(async function () {
      await voting.createPoll(title, description, options, durationInMinutes, false);
    });

    it("should allow a user to vote and emit VoteCast event", async function () {
      await expect(voting.connect(addr1).vote(1, 0))
        .to.emit(voting, "VoteCast")
        .withArgs(1, addr1.address, 0);

      const poll = await voting.getPoll(1);
      expect(poll.totalVotes).to.equal(1);

      const pollOptions = await voting.getPollOptions(1);
      expect(pollOptions[0].voteCount).to.equal(1);
      expect(pollOptions[1].voteCount).to.equal(0);
      expect(pollOptions[2].voteCount).to.equal(0);

      expect(await voting.hasVoted(1, addr1.address)).to.be.true;
      expect(await voting.voterChoice(1, addr1.address)).to.equal(0);

      const [hasVotedStatus, chosenOptionId] = await voting.getUserVoteStatus(1, addr1.address);
      expect(hasVotedStatus).to.be.true;
      expect(chosenOptionId).to.equal(0);
    });

    it("should prevent double-voting by the same user in the same poll", async function () {
      await voting.connect(addr1).vote(1, 0);

      await expect(
        voting.connect(addr1).vote(1, 1)
      ).to.be.revertedWith("Already voted in this poll");
    });

    it("should allow the same user to vote in separate polls", async function () {
      await voting.createPoll("Second Poll", "Desc", ["Option X", "Option Y"], 60, false);

      await voting.connect(addr1).vote(1, 0);
      await expect(voting.connect(addr1).vote(2, 1)).to.not.be.reverted;

      expect(await voting.hasVoted(1, addr1.address)).to.be.true;
      expect(await voting.hasVoted(2, addr1.address)).to.be.true;
    });

    it("should revert if poll does not exist", async function () {
      await expect(
        voting.connect(addr1).vote(999, 0)
      ).to.be.revertedWith("Poll does not exist");
    });

    it("should revert if option ID is invalid", async function () {
      await expect(
        voting.connect(addr1).vote(1, 3)
      ).to.be.revertedWith("Invalid option ID");
    });

    it("should revert if poll has ended", async function () {
      await time.increase(60 * 60 + 1);

      await expect(
        voting.connect(addr1).vote(1, 0)
      ).to.be.revertedWith("Poll has ended");
    });
  });

  describe("Blind Voting", function () {
    const durationInMinutes = 60;

    beforeEach(async function () {
      await voting.createPoll("Blind Poll", "Tally is hidden until end", ["Red", "Blue", "Green"], durationInMinutes, true);
    });

    it("should hide option vote counts and totalVotes while poll is active", async function () {
      // Cast votes
      await voting.connect(addr1).vote(1, 0);
      await voting.connect(addr2).vote(1, 1);
      await voting.connect(addr3).vote(1, 0);

      // Inspect poll while still active
      const poll = await voting.getPoll(1);
      expect(poll.totalVotes).to.equal(0); // Masked

      const allPolls = await voting.getAllPolls();
      expect(allPolls[0].totalVotes).to.equal(0); // Masked

      const paginated = await voting.getPolls(0, 10);
      expect(paginated[0].totalVotes).to.equal(0); // Masked

      const options = await voting.getPollOptions(1);
      expect(options[0].voteCount).to.equal(0); // Masked
      expect(options[1].voteCount).to.equal(0); // Masked
      expect(options[2].voteCount).to.equal(0); // Masked
    });

    it("should reveal option vote counts and totalVotes once endTime has passed", async function () {
      // Cast votes
      await voting.connect(addr1).vote(1, 0);
      await voting.connect(addr2).vote(1, 1);
      await voting.connect(addr3).vote(1, 0);

      // Advance time past endTime
      await time.increase(durationInMinutes * 60 + 1);

      // Inspect poll after end
      const poll = await voting.getPoll(1);
      expect(poll.totalVotes).to.equal(3); // Revealed

      const allPolls = await voting.getAllPolls();
      expect(allPolls[0].totalVotes).to.equal(3); // Revealed

      const paginated = await voting.getPolls(0, 10);
      expect(paginated[0].totalVotes).to.equal(3); // Revealed

      const options = await voting.getPollOptions(1);
      expect(options[0].voteCount).to.equal(2); // Revealed
      expect(options[1].voteCount).to.equal(1); // Revealed
      expect(options[2].voteCount).to.equal(0); // Revealed
    });
  });

  describe("Creator Controls: cancelPoll", function () {
    beforeEach(async function () {
      await voting.createPoll("Cancellable Poll", "Desc", ["A", "B"], 60, false);
    });

    it("should allow creator to cancel poll when totalVotes == 0", async function () {
      await expect(voting.cancelPoll(1))
        .to.emit(voting, "PollCancelled")
        .withArgs(1, owner.address);

      const poll = await voting.getPoll(1);
      expect(poll.isCancelled).to.be.true;

      // Voting on cancelled poll should revert
      await expect(
        voting.connect(addr1).vote(1, 0)
      ).to.be.revertedWith("Poll has been cancelled");
    });

    it("should revert if non-creator attempts to cancel poll", async function () {
      await expect(
        voting.connect(addr1).cancelPoll(1)
      ).to.be.revertedWith("Only creator can cancel");
    });

    it("should revert if already cancelled", async function () {
      await voting.cancelPoll(1);
      await expect(
        voting.cancelPoll(1)
      ).to.be.revertedWith("Poll is already cancelled");
    });

    it("should revert if cancelPoll is called after a vote has been cast", async function () {
      await voting.connect(addr1).vote(1, 0);

      await expect(
        voting.cancelPoll(1)
      ).to.be.revertedWith("Cannot cancel poll with votes");
    });
  });

  describe("Creator Controls: endPollEarly", function () {
    beforeEach(async function () {
      await voting.createPoll("Early End Poll", "Desc", ["Yes", "No"], 120, true);
    });

    it("should allow creator to end poll early and immediately reveal blind results", async function () {
      await voting.connect(addr1).vote(1, 0);

      // Verify still masked
      expect((await voting.getPollOptions(1))[0].voteCount).to.equal(0);

      const tx = await voting.endPollEarly(1);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(voting, "PollEndedEarly")
        .withArgs(1, owner.address, block.timestamp);

      const poll = await voting.getPoll(1);
      expect(poll.endTime).to.equal(block.timestamp);

      // Now results are finalized and revealed
      expect((await voting.getPollOptions(1))[0].voteCount).to.equal(1);
      expect((await voting.getPoll(1)).totalVotes).to.equal(1);

      // Any further votes must revert
      await expect(
        voting.connect(addr2).vote(1, 1)
      ).to.be.revertedWith("Poll has ended");
    });

    it("should revert if non-creator attempts to end poll early", async function () {
      await expect(
        voting.connect(addr1).endPollEarly(1)
      ).to.be.revertedWith("Only creator can end poll");
    });

    it("should revert endPollEarly if poll has already ended naturally", async function () {
      await time.increase(120 * 60 + 1);

      await expect(
        voting.endPollEarly(1)
      ).to.be.revertedWith("Poll has already ended");
    });

    it("should revert endPollEarly if poll is cancelled", async function () {
      await voting.cancelPoll(1);

      await expect(
        voting.endPollEarly(1)
      ).to.be.revertedWith("Poll has been cancelled");
    });
  });

  describe("Soft Delete: archivePoll & unarchivePoll", function () {
    beforeEach(async function () {
      // Create a 60-minute poll
      await voting.createPoll("Poll to Archive", "Description", ["Option 1", "Option 2"], 60, false);
    });

    it("should revert archivePoll if poll does not exist", async function () {
      await expect(voting.archivePoll(999)).to.be.revertedWith("Poll does not exist");
    });

    it("should revert archivePoll if caller is not the creator", async function () {
      await time.increase(61 * 60);
      await expect(
        voting.connect(addr1).archivePoll(1)
      ).to.be.revertedWith("Only creator can archive");
    });

    it("should revert archivePoll while poll is still active", async function () {
      await expect(
        voting.archivePoll(1)
      ).to.be.revertedWith("Poll must be ended or cancelled to archive");
    });

    it("should allow creator to archive an ended poll and emit PollArchived", async function () {
      await time.increase(61 * 60);

      const tx = await voting.archivePoll(1);
      await expect(tx)
        .to.emit(voting, "PollArchived")
        .withArgs(1, owner.address);

      const poll = await voting.getPoll(1);
      expect(poll.archived).to.be.true;
    });

    it("should allow creator to archive a cancelled poll", async function () {
      await voting.cancelPoll(1);

      const tx = await voting.archivePoll(1);
      await expect(tx)
        .to.emit(voting, "PollArchived")
        .withArgs(1, owner.address);

      const poll = await voting.getPoll(1);
      expect(poll.archived).to.be.true;
    });

    it("should revert if poll is already archived", async function () {
      await time.increase(61 * 60);
      await voting.archivePoll(1);

      await expect(
        voting.archivePoll(1)
      ).to.be.revertedWith("Poll is already archived");
    });

    it("should prevent voting on an archived poll", async function () {
      await voting.cancelPoll(1);
      await voting.archivePoll(1);

      await expect(
        voting.connect(addr1).vote(1, 0)
      ).to.be.revertedWith("Poll is archived");
    });

    it("should revert unarchivePoll if caller is not creator", async function () {
      await time.increase(61 * 60);
      await voting.archivePoll(1);

      await expect(
        voting.connect(addr1).unarchivePoll(1)
      ).to.be.revertedWith("Only creator can unarchive");
    });

    it("should revert unarchivePoll if poll is not archived", async function () {
      await expect(
        voting.unarchivePoll(1)
      ).to.be.revertedWith("Poll is not archived");
    });

    it("should allow creator to unarchive an archived poll and emit PollUnarchived", async function () {
      await time.increase(61 * 60);
      await voting.archivePoll(1);

      const tx = await voting.unarchivePoll(1);
      await expect(tx)
        .to.emit(voting, "PollUnarchived")
        .withArgs(1, owner.address);

      const poll = await voting.getPoll(1);
      expect(poll.archived).to.be.false;
    });
  });

  describe("getPollCount() view function", function () {
    it("should return correct poll count", async function () {
      expect(await voting.getPollCount()).to.equal(0);
      await voting.createPoll("P1", "D1", ["A", "B"], 60, false);
      expect(await voting.getPollCount()).to.equal(1);
      await voting.createPoll("P2", "D2", ["A", "B"], 60, false);
      expect(await voting.getPollCount()).to.equal(2);
    });
  });

  describe("Pagination: getPolls(offset, limit)", function () {
    beforeEach(async function () {
      // Create 5 polls
      for (let i = 1; i <= 5; i++) {
        await voting.createPoll(`Poll ${i}`, `Desc ${i}`, ["A", "B"], 60, false);
      }
    });

    it("should return the correct slice of polls", async function () {
      const page1 = await voting.getPolls(0, 2);
      expect(page1.length).to.equal(2);
      expect(page1[0].id).to.equal(1);
      expect(page1[1].id).to.equal(2);

      const page2 = await voting.getPolls(2, 2);
      expect(page2.length).to.equal(2);
      expect(page2[0].id).to.equal(3);
      expect(page2[1].id).to.equal(4);

      const page3 = await voting.getPolls(4, 2);
      expect(page3.length).to.equal(1);
      expect(page3[0].id).to.equal(5);
    });

    it("should return empty array when offset >= pollCount or limit == 0", async function () {
      const outOfBounds = await voting.getPolls(5, 2);
      expect(outOfBounds.length).to.equal(0);

      const zeroLimit = await voting.getPolls(0, 0);
      expect(zeroLimit.length).to.equal(0);
    });
  });

  describe("View Functions Error Handling", function () {
    it("should revert getPoll for non-existent poll", async function () {
      await expect(voting.getPoll(999)).to.be.revertedWith("Poll does not exist");
    });

    it("should revert getPollOptions for non-existent poll", async function () {
      await expect(voting.getPollOptions(42)).to.be.revertedWith("Poll does not exist");
    });

    it("should revert getUserVoteStatus for non-existent poll", async function () {
      await expect(voting.getUserVoteStatus(42, addr1.address)).to.be.revertedWith("Poll does not exist");
    });

    it("should return false and default 0 for user who has not voted", async function () {
      await voting.createPoll("Poll", "Desc", ["A", "B"], 60, false);
      const [hasVotedStatus, chosenOptionId] = await voting.getUserVoteStatus(1, addr2.address);
      expect(hasVotedStatus).to.be.false;
      expect(chosenOptionId).to.equal(0);
    });
  });
});

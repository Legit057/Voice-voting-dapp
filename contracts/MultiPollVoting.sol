// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MultiPollVoting
 * @notice Production-grade decentralized multi-poll voting contract
 * @dev Implements checks-effects-interactions pattern with double-voting prevention,
 *      blind voting support, creator controls, soft delete (archiving), and paginated queries.
 */
contract MultiPollVoting {
    // Safety constants
    uint256 public constant MAX_OPTIONS = 20;
    uint256 public constant MAX_DURATION_MINUTES = 43200; // 30 days
    uint256 public constant MAX_TITLE_LENGTH = 120;
    uint256 public constant MAX_OPTION_LENGTH = 80;

    struct Option {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    struct Poll {
        uint256 id;
        string title;
        string description;
        address creator;
        uint256 endTime;
        bool exists;
        uint256 totalVotes;
        bool isBlind;
        bool isCancelled;
        bool archived;
    }

    // State variables
    uint256 public pollCount;

    // pollId => Poll
    mapping(uint256 => Poll) public polls;

    // pollId => list of Options
    mapping(uint256 => Option[]) private _pollOptions;

    // pollId => voter address => has voted boolean
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // pollId => voter address => chosen option id
    mapping(uint256 => mapping(address => uint256)) public voterChoice;

    // Events
    event PollCreated(
        uint256 indexed pollId,
        string title,
        string description,
        address indexed creator,
        uint256 endTime,
        bool isBlind
    );

    event VoteCast(
        uint256 indexed pollId,
        address indexed voter,
        uint256 indexed optionId
    );

    event PollCancelled(
        uint256 indexed pollId,
        address indexed creator
    );

    event PollEndedEarly(
        uint256 indexed pollId,
        address indexed creator,
        uint256 endTime
    );

    event PollArchived(
        uint256 indexed pollId,
        address indexed creator
    );

    event PollUnarchived(
        uint256 indexed pollId,
        address indexed creator
    );

    /**
     * @notice Creates a new voting poll with safety limits and optional blind voting
     * @param _title Title of the poll (max 120 chars)
     * @param _description Description of the poll
     * @param _optionNames List of voting option names (2 - 20 options, max 80 chars each)
     * @param _durationInMinutes Duration of poll in minutes (1 - 43200 minutes)
     * @param _isBlind Whether vote counts remain hidden until endTime
     * @return pollId The ID of the newly created poll
     */
    function createPoll(
        string memory _title,
        string memory _description,
        string[] memory _optionNames,
        uint256 _durationInMinutes,
        bool _isBlind
    ) external returns (uint256) {
        require(bytes(_title).length > 0, "Title cannot be empty");
        require(bytes(_title).length <= MAX_TITLE_LENGTH, "Title exceeds maximum length");
        require(_optionNames.length >= 2, "Poll must have at least 2 options");
        require(_optionNames.length <= MAX_OPTIONS, "Options exceed maximum limit");
        require(_durationInMinutes > 0, "Duration must be greater than 0");
        require(_durationInMinutes <= MAX_DURATION_MINUTES, "Duration exceeds maximum limit");

        pollCount++;
        uint256 newPollId = pollCount;
        uint256 endTime = block.timestamp + (_durationInMinutes * 1 minutes);

        polls[newPollId] = Poll({
            id: newPollId,
            title: _title,
            description: _description,
            creator: msg.sender,
            endTime: endTime,
            exists: true,
            totalVotes: 0,
            isBlind: _isBlind,
            isCancelled: false,
            archived: false
        });

        for (uint256 i = 0; i < _optionNames.length; i++) {
            require(bytes(_optionNames[i]).length > 0, "Option name cannot be empty");
            require(bytes(_optionNames[i]).length <= MAX_OPTION_LENGTH, "Option name exceeds maximum length");
            _pollOptions[newPollId].push(Option({
                id: i,
                name: _optionNames[i],
                voteCount: 0
            }));
        }

        emit PollCreated(newPollId, _title, _description, msg.sender, endTime, _isBlind);

        return newPollId;
    }

    /**
     * @notice Casts a vote for a specific option in a poll
     * @dev Follows Checks-Effects-Interactions pattern
     * @param _pollId The poll ID to vote in
     * @param _optionId The option ID chosen
     */
    function vote(uint256 _pollId, uint256 _optionId) external {
        // Checks
        Poll storage poll = polls[_pollId];
        require(poll.exists, "Poll does not exist");
        require(!poll.archived, "Poll is archived");
        require(!poll.isCancelled, "Poll has been cancelled");
        require(block.timestamp < poll.endTime, "Poll has ended");
        require(!hasVoted[_pollId][msg.sender], "Already voted in this poll");
        require(_optionId < _pollOptions[_pollId].length, "Invalid option ID");

        // Effects
        hasVoted[_pollId][msg.sender] = true;
        voterChoice[_pollId][msg.sender] = _optionId;
        _pollOptions[_pollId][_optionId].voteCount += 1;
        poll.totalVotes += 1;

        // Interactions (None)

        emit VoteCast(_pollId, msg.sender, _optionId);
    }

    /**
     * @notice Cancels a poll if no votes have been cast yet
     * @dev Only callable by the creator of the poll
     * @param _pollId The poll ID to cancel
     */
    function cancelPoll(uint256 _pollId) external {
        Poll storage poll = polls[_pollId];
        require(poll.exists, "Poll does not exist");
        require(msg.sender == poll.creator, "Only creator can cancel");
        require(!poll.archived, "Poll is archived");
        require(!poll.isCancelled, "Poll is already cancelled");
        require(poll.totalVotes == 0, "Cannot cancel poll with votes");

        poll.isCancelled = true;

        emit PollCancelled(_pollId, msg.sender);
    }

    /**
     * @notice Ends an active poll early
     * @dev Only callable by the creator while the poll is active
     * @param _pollId The poll ID to finalize
     */
    function endPollEarly(uint256 _pollId) external {
        Poll storage poll = polls[_pollId];
        require(poll.exists, "Poll does not exist");
        require(msg.sender == poll.creator, "Only creator can end poll");
        require(!poll.archived, "Poll is archived");
        require(!poll.isCancelled, "Poll has been cancelled");
        require(block.timestamp < poll.endTime, "Poll has already ended");

        poll.endTime = block.timestamp;

        emit PollEndedEarly(_pollId, msg.sender, block.timestamp);
    }

    /**
     * @notice Archives an ended or cancelled poll (soft delete)
     * @dev Only callable by poll creator; poll must be ended or cancelled
     * @param _pollId The poll ID to archive
     */
    function archivePoll(uint256 _pollId) external {
        Poll storage poll = polls[_pollId];
        require(poll.exists, "Poll does not exist");
        require(msg.sender == poll.creator, "Only creator can archive");
        require(!poll.archived, "Poll is already archived");
        require(block.timestamp >= poll.endTime || poll.isCancelled, "Poll must be ended or cancelled to archive");

        poll.archived = true;

        emit PollArchived(_pollId, msg.sender);
    }

    /**
     * @notice Unarchives a previously archived poll
     * @dev Only callable by poll creator
     * @param _pollId The poll ID to unarchive
     */
    function unarchivePoll(uint256 _pollId) external {
        Poll storage poll = polls[_pollId];
        require(poll.exists, "Poll does not exist");
        require(msg.sender == poll.creator, "Only creator can unarchive");
        require(poll.archived, "Poll is not archived");

        poll.archived = false;

        emit PollUnarchived(_pollId, msg.sender);
    }

    /**
     * @notice Returns the total count of polls created
     * @return Total poll count
     */
    function getPollCount() external view returns (uint256) {
        return pollCount;
    }

    /**
     * @notice Retrieves a single poll by ID, masking totalVotes if blind voting is active
     * @param _pollId The poll ID
     * @return Poll struct with masked or real totalVotes and archived flag
     */
    function getPoll(uint256 _pollId) external view returns (Poll memory) {
        require(polls[_pollId].exists, "Poll does not exist");
        Poll memory p = polls[_pollId];
        if (p.isBlind && block.timestamp < p.endTime) {
            p.totalVotes = 0;
        }
        return p;
    }

    /**
     * @notice Retrieves all polls created so far
     * @dev Masks totalVotes for blind polls that have not yet reached endTime
     * @return Array of Poll structs including archived flag
     */
    function getAllPolls() external view returns (Poll[] memory) {
        Poll[] memory allPolls = new Poll[](pollCount);
        for (uint256 i = 1; i <= pollCount; i++) {
            Poll memory p = polls[i];
            if (p.isBlind && block.timestamp < p.endTime) {
                p.totalVotes = 0;
            }
            allPolls[i - 1] = p;
        }
        return allPolls;
    }

    /**
     * @notice Retrieves polls in paginated slices safely
     * @param _offset Zero-indexed poll starting offset
     * @param _limit Maximum number of polls to return
     * @return Array of Poll structs for the requested page including archived flag
     */
    function getPolls(uint256 _offset, uint256 _limit) external view returns (Poll[] memory) {
        if (_offset >= pollCount || _limit == 0) {
            return new Poll[](0);
        }

        uint256 remaining = pollCount - _offset;
        uint256 count = _limit > remaining ? remaining : _limit;
        Poll[] memory page = new Poll[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 pollId = _offset + i + 1;
            Poll memory p = polls[pollId];
            if (p.isBlind && block.timestamp < p.endTime) {
                p.totalVotes = 0;
            }
            page[i] = p;
        }

        return page;
    }

    /**
     * @notice Retrieves options for a given poll
     * @dev If isBlind is true and poll has not ended, voteCount = 0 is returned for all options
     * @param _pollId The poll ID
     * @return Array of Option structs
     */
    function getPollOptions(uint256 _pollId) external view returns (Option[] memory) {
        require(polls[_pollId].exists, "Poll does not exist");
        Poll storage poll = polls[_pollId];
        Option[] memory options = _pollOptions[_pollId];

        if (poll.isBlind && block.timestamp < poll.endTime) {
            Option[] memory maskedOptions = new Option[](options.length);
            for (uint256 i = 0; i < options.length; i++) {
                maskedOptions[i] = Option({
                    id: options[i].id,
                    name: options[i].name,
                    voteCount: 0
                });
            }
            return maskedOptions;
        }

        return options;
    }

    /**
     * @notice Retrieves voting status and chosen option of a user for a poll
     * @param _pollId The poll ID
     * @param _user The address of the voter
     * @return hasVotedStatus Whether the user has voted
     * @return chosenOptionId The option ID chosen (only meaningful if hasVotedStatus is true)
     */
    function getUserVoteStatus(uint256 _pollId, address _user)
        external
        view
        returns (bool hasVotedStatus, uint256 chosenOptionId)
    {
        require(polls[_pollId].exists, "Poll does not exist");
        return (hasVoted[_pollId][_user], voterChoice[_pollId][_user]);
    }
}

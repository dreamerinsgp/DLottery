// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IRandomnessProvider {
    function requestRandomness() external returns (uint256);
    function deliver(uint256 requestId) external;
}

/// @notice Single active round, independently claimable historical rounds.
contract DLottery is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { ACTIVE, DRAWING, WINNER_DECLARED, COMPLETED, NO_WINNER, CANCELLED }
    struct Draw {
        uint256 id;
        Status status;
        uint64 startTime;
        uint64 deadline;
        uint64 finalizedAt;
        uint8 participantCount;
        uint8 luckyNumber;
        address winner;
        uint256 inheritedRollover;
        uint256 pool;
        uint256 daoFee;
        uint256 winnerPrize;
        uint256 requestId;
    }
    IERC20 public immutable token;
    uint8 public immutable tokenDecimals;
    uint256 public immutable ticketPrice;
    uint8 public immutable minimumParticipants;
    address public immutable dao;
    IRandomnessProvider public immutable randomnessProvider;
    uint256 public constant DURATION = 24 hours;
    uint8 public constant MAX_PARTICIPANTS = 5;
    uint256 public currentDrawId;
    uint256 public pendingRollover;
    uint256 public activePool;
    uint256 public outstandingPrizes;
    uint256 public outstandingRefunds;
    mapping(uint256 => Draw) private draws;
    mapping(uint256 => address[10]) private owners;
    mapping(uint256 => mapping(address => uint8)) public ticketOf;
    mapping(uint256 => mapping(address => bool)) public refunded;
    mapping(uint256 => uint256) public requestDraw;

    error InvalidConfiguration();
    error InvalidDraw();
    error InvalidState();
    error NotEligible();
    error AlreadyParticipated();
    error TicketsClosed();
    error WrongPaymentAmount();
    error NotClaimable();
    error Unauthorized();

    event DrawStarted(uint256 indexed drawId, uint64 startTime, uint64 deadline, uint256 ticketPrice, uint8 minimumParticipants, uint256 inheritedRollover);
    event TicketBought(uint256 indexed drawId, address indexed buyer, uint8 ticketNumber, uint256 amount, uint8 participantCount, uint256 pool);
    event RandomnessRequested(uint256 indexed drawId, uint256 requestId);
    event LotteryDrawn(uint256 indexed drawId, uint8 luckyNumber, address winner, uint256 pool, uint256 daoFee, uint256 winnerPrize, uint256 rollover);
    event DrawCancelled(uint256 indexed drawId, uint8 participantCount, uint256 refundableTotal, uint256 rollover);
    event PrizeClaimed(uint256 indexed drawId, address indexed winner, uint256 amount, address dao, uint256 daoFee);
    event RefundClaimed(uint256 indexed drawId, address indexed participant, uint256 amount);

    constructor(address token_, address dao_, uint8 minimum_, address provider_) {
        if (token_.code.length == 0 || provider_.code.length == 0 || dao_ == address(0) || dao_ == address(this) || minimum_ < 1 || minimum_ > 5) revert InvalidConfiguration();
        uint8 decimals_ = IERC20Metadata(token_).decimals();
        if (decimals_ > 75) revert InvalidConfiguration();
        token = IERC20(token_);
        tokenDecimals = decimals_;
        ticketPrice = 10 * 10 ** uint256(decimals_);
        dao = dao_;
        minimumParticipants = minimum_;
        randomnessProvider = IRandomnessProvider(provider_);
    }

    function getDraw(uint256 id) public view returns (Draw memory) {
        if (id == 0 || id > currentDrawId) revert InvalidDraw();
        return draws[id];
    }
    function ticketOwners(uint256 id) external view returns (address[10] memory) {
        if (id == 0 || id > currentDrawId) revert InvalidDraw();
        return owners[id];
    }
    function canStartDraw() public view returns (bool) {
        return currentDrawId == 0 || uint8(draws[currentDrawId].status) >= uint8(Status.WINNER_DECLARED);
    }
    function canPerformDraw(uint256 id) public view returns (bool) {
        if (id == 0 || id != currentDrawId) return false;
        Draw storage d = draws[id];
        return d.status == Status.ACTIVE && (d.participantCount == MAX_PARTICIPANTS || block.timestamp >= d.deadline);
    }
    function claimable(uint256 id, address wallet) external view returns (uint256 prize, uint256 refund) {
        Draw storage d = draws[id];
        if (d.status == Status.WINNER_DECLARED && d.winner == wallet) prize = d.winnerPrize;
        if (d.status == Status.CANCELLED && ticketOf[id][wallet] != 0 && !refunded[id][wallet]) refund = ticketPrice;
    }
    function liabilities() external view returns (uint256) {
        return activePool + pendingRollover + outstandingPrizes + outstandingRefunds;
    }
    /// @param expectedPreviousId Protects concurrent/stale start requests.
    function startDraw(uint256 expectedPreviousId) external nonReentrant {
        if (expectedPreviousId != currentDrawId) revert InvalidDraw();
        if (!canStartDraw()) revert InvalidState();
        uint256 id = ++currentDrawId;
        Draw storage d = draws[id];
        d.id = id;
        d.startTime = uint64(block.timestamp);
        d.deadline = uint64(block.timestamp + DURATION);
        d.inheritedRollover = pendingRollover;
        d.pool = pendingRollover;
        activePool = pendingRollover;
        pendingRollover = 0;
        emit DrawStarted(id, d.startTime, d.deadline, ticketPrice, minimumParticipants, d.inheritedRollover);
    }
    function buyTicket(uint256 id) external nonReentrant {
        if (id == 0 || id != currentDrawId) revert InvalidDraw();
        Draw storage d = draws[id];
        if (d.status != Status.ACTIVE || block.timestamp >= d.deadline || d.participantCount >= MAX_PARTICIPANTS) revert TicketsClosed();
        if (ticketOf[id][msg.sender] != 0) revert AlreadyParticipated();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), ticketPrice);
        if (token.balanceOf(address(this)) != beforeBalance + ticketPrice) revert WrongPaymentAmount();
        uint8 number = ++d.participantCount;
        owners[id][number - 1] = msg.sender;
        ticketOf[id][msg.sender] = number;
        d.pool += ticketPrice;
        activePool += ticketPrice;
        emit TicketBought(id, msg.sender, number, ticketPrice, number, d.pool);
    }
    function performDraw(uint256 id) external nonReentrant {
        if (!canPerformDraw(id)) revert NotEligible();
        Draw storage d = draws[id];
        activePool = 0;
        if (d.participantCount < minimumParticipants) {
            d.status = Status.CANCELLED;
            d.finalizedAt = uint64(block.timestamp);
            uint256 refunds = uint256(d.participantCount) * ticketPrice;
            outstandingRefunds += refunds;
            pendingRollover += d.inheritedRollover;
            emit DrawCancelled(id, d.participantCount, refunds, d.inheritedRollover);
        } else {
            activePool = d.pool;
            d.status = Status.DRAWING;
            uint256 requestId = randomnessProvider.requestRandomness();
            if (requestId == 0 || requestDraw[requestId] != 0) revert InvalidState();
            d.requestId = requestId;
            requestDraw[requestId] = id;
            emit RandomnessRequested(id, requestId);
        }
    }
    /// @dev Duplicate or unknown authenticated callbacks are harmless. No token calls.
    function fulfillRandomness(uint256 requestId, uint256 word) external {
        if (msg.sender != address(randomnessProvider)) revert Unauthorized();
        uint256 id = requestDraw[requestId];
        Draw storage d = draws[id];
        if (id == 0 || d.status != Status.DRAWING) return;
        uint8 lucky = uint8(word % 10) + 1;
        d.luckyNumber = lucky;
        d.winner = owners[id][lucky - 1];
        d.finalizedAt = uint64(block.timestamp);
        activePool = 0;
        uint256 rollover;
        if (d.winner == address(0)) {
            d.status = Status.NO_WINNER;
            rollover = d.pool;
            pendingRollover += rollover;
        } else {
            d.status = Status.WINNER_DECLARED;
            d.daoFee = Math.mulDiv(d.pool - ticketPrice, 500, 10000);
            d.winnerPrize = d.pool - d.daoFee;
            outstandingPrizes += d.pool;
        }
        emit LotteryDrawn(id, lucky, d.winner, d.pool, d.daoFee, d.winnerPrize, rollover);
    }
    /// @notice Retry delivery of an already fulfilled word, never request a new word.
    function finalizeDraw(uint256 id) external {
        if (id == 0 || draws[id].status != Status.DRAWING) revert InvalidState();
        randomnessProvider.deliver(draws[id].requestId);
    }
    function claimPrize(uint256 id) external nonReentrant {
        Draw storage d = draws[id];
        if (d.status != Status.WINNER_DECLARED || d.winner != msg.sender) revert NotClaimable();
        d.status = Status.COMPLETED;
        outstandingPrizes -= d.pool;
        if (d.daoFee != 0) token.safeTransfer(dao, d.daoFee);
        token.safeTransfer(msg.sender, d.winnerPrize);
        emit PrizeClaimed(id, msg.sender, d.winnerPrize, dao, d.daoFee);
    }
    function claimRefund(uint256 id) external nonReentrant {
        if (draws[id].status != Status.CANCELLED || ticketOf[id][msg.sender] == 0 || refunded[id][msg.sender]) revert NotClaimable();
        refunded[id][msg.sender] = true;
        outstandingRefunds -= ticketPrice;
        token.safeTransfer(msg.sender, ticketPrice);
        emit RefundClaimed(id, msg.sender, ticketPrice);
    }
}

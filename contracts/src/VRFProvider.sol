// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IVRFCoordinatorV2Plus} from "./vendor/chainlink/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vendor/chainlink/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
interface ILotteryCallback { function fulfillRandomness(uint256 requestId, uint256 word) external; }

/// @notice VRF v2.5 adapter. Callback stores output; failed delivery is retryable without rerolling.
contract VRFProvider {
    IVRFCoordinatorV2Plus public immutable coordinator;
    address public immutable configurator;
    error OnlyCoordinatorCanFulfill(address have, address want);
    address public lottery;
    uint256 public immutable subscriptionId;
    bytes32 public immutable keyHash;
    uint16 public immutable confirmations;
    uint32 public immutable callbackGasLimit;
    bool public immutable nativePayment;
    mapping(uint256 => bool) public requested;
    mapping(uint256 => bool) public ready;
    mapping(uint256 => bool) public delivered;
    mapping(uint256 => uint256) public words;
    event WordStored(uint256 indexed requestId);
    error InvalidRequest();

    constructor(address coordinator_, uint256 subId, bytes32 key, uint16 confs, uint32 gasLimit, bool native_) {
        coordinator = IVRFCoordinatorV2Plus(coordinator_);
        configurator = msg.sender;
        require(coordinator_.code.length > 0 && subId > 0 && key != bytes32(0) && confs >= 3 && confs <= 200 && gasLimit >= 300000, "Invalid VRF configuration");
        subscriptionId = subId; keyHash = key; confirmations = confs; callbackGasLimit = gasLimit; nativePayment = native_;
    }
    function setLottery(address value) external {
        require(msg.sender == configurator, "Only configurator");
        require(lottery == address(0) && value.code.length > 0, "Lottery already set or invalid");
        lottery = value;
    }
    function requestRandomness() external returns (uint256 id) {
        if (msg.sender != lottery) revert InvalidRequest();
        id = coordinator.requestRandomWords(VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash, subId: subscriptionId, requestConfirmations: confirmations,
            callbackGasLimit: callbackGasLimit, numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: nativePayment}))
        }));
        requested[id] = true;
    }
    function rawFulfillRandomWords(uint256 id, uint256[] calldata values) external {
        if (msg.sender != address(coordinator)) revert OnlyCoordinatorCanFulfill(msg.sender, address(coordinator));
        if (!requested[id] || ready[id] || values.length == 0) return;
        words[id] = values[0]; ready[id] = true;
        emit WordStored(id);
        // The stored word survives a failed downstream callback.
        try ILotteryCallback(lottery).fulfillRandomness(id, values[0]) { delivered[id] = true; } catch {}
    }
    function deliver(uint256 id) external {
        if (!ready[id]) revert InvalidRequest();
        if (delivered[id]) return;
        ILotteryCallback(lottery).fulfillRandomness(id, words[id]);
        delivered[id] = true;
    }
}

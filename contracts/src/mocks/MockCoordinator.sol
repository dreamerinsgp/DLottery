// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {VRFV2PlusClient} from "../vendor/chainlink/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
interface IVRFCallback { function rawFulfillRandomWords(uint256 id, uint256[] calldata words) external; }
contract MockCoordinator {
    uint256 public nextId;
    mapping(uint256 => address) public consumers;
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata) external returns (uint256 id) {
        id = ++nextId; consumers[id] = msg.sender;
    }
    function fulfill(uint256 id, uint256 word) external {
        uint256[] memory values = new uint256[](1); values[0] = word;
        IVRFCallback(consumers[id]).rawFulfillRandomWords(id, values);
    }
}

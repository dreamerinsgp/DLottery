// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IMockCallback { function fulfillRandomness(uint256, uint256) external; }
/// @dev Deterministic LOCAL ONLY. Refuses public chain deployment.
contract MockRandomnessProvider {
    uint256 public nextId;
    mapping(uint256 => address) public consumers;
    mapping(uint256 => bool) public ready;
    mapping(uint256 => uint256) public words;
    constructor() { require(block.chainid == 31337 || block.chainid == 1337, "Local chains only"); }
    function requestRandomness() external returns (uint256 id) { id = ++nextId; consumers[id] = msg.sender; }
    function fulfill(uint256 id, uint256 word) external {
        require(consumers[id] != address(0), "Unknown request");
        if (!ready[id]) { ready[id] = true; words[id] = word; }
        IMockCallback(consumers[id]).fulfillRandomness(id, words[id]);
    }
    function deliver(uint256 id) external {
        require(ready[id], "Randomness pending");
        IMockCallback(consumers[id]).fulfillRandomness(id, words[id]);
    }
}

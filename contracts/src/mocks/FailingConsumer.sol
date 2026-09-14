// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IProviderFixture { function requestRandomness() external returns(uint256); }
contract FailingConsumer {
    bool public fail = true;
    uint256 public received;
    function request(address provider) external { IProviderFixture(provider).requestRandomness(); }
    function setFail(bool value) external { fail = value; }
    function fulfillRandomness(uint256, uint256 word) external { require(!fail, "Consumer failure"); received = word; }
}

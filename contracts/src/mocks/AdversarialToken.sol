// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {MockUSD8} from "./MockUSD8.sol";
contract AdversarialToken is MockUSD8 {
    address public blocked;
    bool public chargeFee;
    address public callbackTarget;
    bytes public callbackData;
    bool private inCallback;
    bool public reentrySucceeded;
    constructor() MockUSD8(0) {}
    function configure(address blocked_, bool fee_, address target_, bytes calldata data_) external {
        blocked = blocked_; chargeFee = fee_; callbackTarget = target_; callbackData = data_;
    }
    function _update(address from, address to, uint256 amount) internal override {
        require(to != blocked || to == address(0), "Blocked recipient");
        if (callbackTarget != address(0) && !inCallback && from != address(0)) {
            inCallback = true;
            (reentrySucceeded,) = callbackTarget.call(callbackData);
            inCallback = false;
        }
        if (chargeFee && from != address(0) && to != address(0) && amount > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else super._update(from, to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev Unrestricted minting is for local/testnet fixtures only.
contract MockUSD8 is ERC20 {
    uint8 private immutable places;
    constructor(uint8 decimals_) ERC20("USD8 Test Token", "USD8") { places = decimals_; }
    function decimals() public view override returns (uint8) { return places; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

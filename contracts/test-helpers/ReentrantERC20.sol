// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

interface IClaimable {
    function claim() external;
}

/**
 * @dev Malicious ERC-20 that attempts a re-entrant call to `claim()` on the
 *      escrow contract during a `transfer` only when the attack is armed.
 *      The arm/disarm toggle lets setUp complete normally (fund uses
 *      transferFrom) before enabling the attack for the claim() test.
 */
contract ReentrantERC20 is MockERC20 {
    address public target;  // the AirCargoEscrow contract
    bool    public armed;   // only re-enter when true

    constructor() MockERC20("Reentrant USDC", "rUSDC", 6) {}

    function setTarget(address _target) external {
        target = _target;
    }

    /// @dev Arm the re-entrancy hook (call just before the victim claim()).
    function arm() external {
        armed = true;
    }

    /// @dev Override transfer; when armed, attempt re-entry into claim().
    function _transfer(address from, address to, uint256 amount) internal override {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);

        // Re-entrant call — ReentrancyGuard on the escrow must block this.
        if (armed && target != address(0)) {
            IClaimable(target).claim();
        }
    }
}

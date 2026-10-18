// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AirCargoEscrow} from "../AirCargoEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {ReentrantERC20} from "../test-helpers/ReentrantERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

contract AirCargoEscrowTest is Test {
    // ─── Addresses ───────────────────────────────────────────────────────────
    address internal owner      = makeAddr("owner");
    address internal forwarder  = makeAddr("forwarder");
    address internal carrier    = makeAddr("carrier");
    address internal handler    = makeAddr("handler");
    address internal stranger   = makeAddr("stranger");

    // ─── Constants ───────────────────────────────────────────────────────────
    bytes32 internal constant AWB_REF   = keccak256("AWB-001-2024");
    uint256 internal constant AMOUNT    = 5_000_000; // 5 USDC (6 decimals)
    uint256 internal constant MAX_AMOUNT = 10_000_000;
    uint16  internal constant CARRIER_BPS = 7_000;   // 70 %
    uint16  internal constant HANDLER_BPS = 3_000;   // 30 %

    // ─── Contracts ───────────────────────────────────────────────────────────
    MockERC20       internal usdc;
    AirCargoEscrow  internal escrow;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// @dev Returns a deadline 1 day in the future (safe for all tests).
    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    /// @dev Creates a shipment as `forwarder` with standard parameters.
    function _createShipment() internal returns (uint256 shipmentId) {
        vm.prank(forwarder);
        shipmentId = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline()
        );
    }

    /// @dev Creates and funds a shipment as `forwarder`.
    function _createAndFund() internal returns (uint256 shipmentId) {
        shipmentId = _createShipment();
        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fund(shipmentId);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  setUp — runs before EVERY test
    // ═══════════════════════════════════════════════════════════════════════

    function setUp() public {
        // Deploy mock USDC (6 decimals, matching real USDC)
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy escrow
        escrow = new AirCargoEscrow(address(usdc), owner);

        // Seed forwarder with ample USDC for tests
        usdc.mint(forwarder, 100 * MAX_AMOUNT);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  1. Deployment & initialisation
    // ═══════════════════════════════════════════════════════════════════════

    function test_Constructor_SetsUsdcAndOwner() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.owner(), owner);
    }

    function test_Constructor_SetsMaxAmount() public view {
        assertEq(escrow.maxAmount(), MAX_AMOUNT);
    }

    function test_Constructor_ShipmentCountStartsAtZero() public view {
        assertEq(escrow.shipmentCount(), 0);
    }

    function test_Constructor_ZeroUsdcReverts() public {
        vm.expectRevert(AirCargoEscrow.ZeroAddress.selector);
        new AirCargoEscrow(address(0), owner);
    }

    function test_Constructor_ZeroOwnerReverts() public {
        // OZ Ownable(address(0)) fires OwnableInvalidOwner before the contract's
        // own ZeroAddress check.  The escrow's ZeroAddress guard is therefore
        // unreachable for the owner argument — this is a minor contract bug
        // (guard order / redundancy) noted in the report.
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0))
        );
        new AirCargoEscrow(address(usdc), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  2. createShipment — happy path
    // ═══════════════════════════════════════════════════════════════════════

    function test_CreateShipment_ReturnsIdAndIncrements() public {
        uint256 id0 = _createShipment();
        assertEq(id0, 0);
        assertEq(escrow.shipmentCount(), 1);

        vm.prank(forwarder);
        uint256 id1 = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline()
        );
        assertEq(id1, 1);
        assertEq(escrow.shipmentCount(), 2);
    }

    function test_CreateShipment_StoresCorrectFields() public {
        uint64 dl = _deadline();
        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl
        );

        (
            bytes32 awbRef,
            address storedForwarder,
            address storedCarrier,
            address storedHandler,
            uint16 cBps,
            uint16 hBps,
            uint256 amount,
            uint64 deadline,
            AirCargoEscrow.Status status
        ) = escrow.shipments(id);

        assertEq(awbRef, AWB_REF);
        assertEq(storedForwarder, forwarder);
        assertEq(storedCarrier, carrier);
        assertEq(storedHandler, handler);
        assertEq(cBps, CARRIER_BPS);
        assertEq(hBps, HANDLER_BPS);
        assertEq(amount, AMOUNT);
        assertEq(deadline, dl);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Created));
    }

    function test_CreateShipment_EmitsShipmentCreated() public {
        uint64 dl = _deadline();
        vm.prank(forwarder);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit AirCargoEscrow.ShipmentCreated(
            0, AWB_REF, forwarder, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl
        );
        escrow.createShipment(AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  2a. createShipment — revert paths
    // ═══════════════════════════════════════════════════════════════════════

    /// TC-2: bps not summing to 10 000 reverts
    function test_CreateShipment_BpsNotFull_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.BpsNotFull.selector);
        escrow.createShipment(AWB_REF, carrier, handler, 5_000, 4_000, AMOUNT, _deadline());
    }

    function test_CreateShipment_BpsOver10000_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.BpsNotFull.selector);
        escrow.createShipment(AWB_REF, carrier, handler, 6_000, 5_000, AMOUNT, _deadline());
    }

    /// TC-11: amount over maxAmount reverts
    function test_CreateShipment_AmountOverCap_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.AmountExceedsCap.selector);
        escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, MAX_AMOUNT + 1, _deadline()
        );
    }

    function test_CreateShipment_ZeroAmount_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.ZeroAmount.selector);
        escrow.createShipment(AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, 0, _deadline());
    }

    /// TC-15: ZeroAddress — carrier
    function test_CreateShipment_ZeroCarrier_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.ZeroAddress.selector);
        escrow.createShipment(AWB_REF, address(0), handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline());
    }

    /// TC-15: ZeroAddress — handler
    function test_CreateShipment_ZeroHandler_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.ZeroAddress.selector);
        escrow.createShipment(AWB_REF, carrier, address(0), CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline());
    }

    function test_CreateShipment_DeadlineInPast_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.DeadlineInPast.selector);
        escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT,
            uint64(block.timestamp)  // equal to now — not strictly in the future
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  3. fund — happy path + revert paths
    // ═══════════════════════════════════════════════════════════════════════

    function test_Fund_TransfersUSDCAndStatusFunded() public {
        uint256 id = _createShipment();
        uint256 balBefore = usdc.balanceOf(forwarder);

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fund(id);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(forwarder), balBefore - AMOUNT);

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Funded));
    }

    function test_Fund_EmitsFundedEvent() public {
        uint256 id = _createShipment();

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AirCargoEscrow.Funded(id, AMOUNT);
        escrow.fund(id);
        vm.stopPrank();
    }

    /// TC-3: Non-forwarder calling fund reverts NotForwarder
    function test_Fund_NonForwarder_Reverts() public {
        uint256 id = _createShipment();
        vm.prank(stranger);
        vm.expectRevert(AirCargoEscrow.NotForwarder.selector);
        escrow.fund(id);
    }

    /// TC-10: Funding twice reverts WrongStatus
    function test_Fund_Twice_Reverts() public {
        uint256 id = _createAndFund();
        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(AirCargoEscrow.WrongStatus.selector);
        escrow.fund(id);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  4. confirmDelivery — happy path & TC-1
    // ═══════════════════════════════════════════════════════════════════════

    /// TC-1: 70/30 split — full happy path
    function test_ConfirmDelivery_CreditsClaimableCorrectly() public {
        uint256 id = _createAndFund();

        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        // carrier gets 70 % of 5_000_000 = 3_500_000
        assertEq(escrow.claimable(carrier), 3_500_000, "carrier claimable mismatch");
        // handler gets remainder: 5_000_000 - 3_500_000 = 1_500_000
        assertEq(escrow.claimable(handler), 1_500_000, "handler claimable mismatch");
    }

    function test_ConfirmDelivery_StatusReleased() public {
        uint256 id = _createAndFund();
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Released));
    }

    function test_ConfirmDelivery_EmitsReleasedEvent() public {
        uint256 id = _createAndFund();

        vm.prank(forwarder);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AirCargoEscrow.Released(id, 3_500_000, 1_500_000);
        escrow.confirmDelivery(id);
    }

    /// TC-4: Non-forwarder calling confirmDelivery reverts NotForwarder
    function test_ConfirmDelivery_NonForwarder_Reverts() public {
        uint256 id = _createAndFund();
        vm.prank(stranger);
        vm.expectRevert(AirCargoEscrow.NotForwarder.selector);
        escrow.confirmDelivery(id);
    }

    /// TC-8: Double release reverts WrongStatus
    function test_ConfirmDelivery_Twice_Reverts() public {
        uint256 id = _createAndFund();
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.WrongStatus.selector);
        escrow.confirmDelivery(id);
    }

    function test_ConfirmDelivery_WhenNotFunded_Reverts() public {
        uint256 id = _createShipment();
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.WrongStatus.selector);
        escrow.confirmDelivery(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  5. claim — TC-1 continued
    // ═══════════════════════════════════════════════════════════════════════

    function test_Claim_CarrierAndHandlerReceiveExactAmounts() public {
        uint256 id = _createAndFund();
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        // carrier claims
        vm.prank(carrier);
        escrow.claim();
        assertEq(usdc.balanceOf(carrier), 3_500_000, "carrier USDC balance");
        assertEq(escrow.claimable(carrier), 0, "carrier claimable cleared");

        // handler claims
        vm.prank(handler);
        escrow.claim();
        assertEq(usdc.balanceOf(handler), 1_500_000, "handler USDC balance");
        assertEq(escrow.claimable(handler), 0, "handler claimable cleared");
    }

    function test_Claim_EmitsClaimedEvent() public {
        uint256 id = _createAndFund();
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        vm.prank(carrier);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AirCargoEscrow.Claimed(carrier, 3_500_000);
        escrow.claim();
    }

    /// TC-16: claim() with nothing claimable reverts NothingToClaim
    function test_Claim_NothingToClaim_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(AirCargoEscrow.NothingToClaim.selector);
        escrow.claim();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  6. refund
    // ═══════════════════════════════════════════════════════════════════════

    /// TC-7: refund before deadline reverts
    function test_Refund_BeforeDeadline_Reverts() public {
        uint256 id = _createAndFund();
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.DeadlineNotPassed.selector);
        escrow.refund(id);
    }

    /// TC-7: warp to exactly deadline — still reverts (condition is `<=`)
    function test_Refund_AtExactDeadline_Reverts() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(dl); // block.timestamp == deadline  →  `<= deadline` is true → revert
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.DeadlineNotPassed.selector);
        escrow.refund(id);
    }

    /// TC-7: warp past deadline — refund succeeds
    function test_Refund_AfterDeadline_Succeeds() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(uint256(dl) + 1);

        uint256 balBefore = usdc.balanceOf(forwarder);

        vm.prank(forwarder);
        escrow.refund(id);

        assertEq(usdc.balanceOf(forwarder), balBefore + AMOUNT);

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Refunded));
    }

    function test_Refund_EmitsRefundedEvent() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(uint256(dl) + 1);

        vm.prank(forwarder);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit AirCargoEscrow.Refunded(id, AMOUNT);
        escrow.refund(id);
    }

    /// TC-5: Non-forwarder calling refund reverts NotForwarder
    function test_Refund_NonForwarder_Reverts() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(uint256(dl) + 1);

        vm.prank(stranger);
        vm.expectRevert(AirCargoEscrow.NotForwarder.selector);
        escrow.refund(id);
    }

    /// TC-9: Double refund reverts WrongStatus
    function test_Refund_Twice_Reverts() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(uint256(dl) + 1);

        vm.prank(forwarder);
        escrow.refund(id);

        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.WrongStatus.selector);
        escrow.refund(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  7. cancel
    // ═══════════════════════════════════════════════════════════════════════

    /// TC-14: Cancel before funding succeeds
    function test_Cancel_BeforeFunding_Succeeds() public {
        uint256 id = _createShipment();
        vm.prank(forwarder);
        escrow.cancel(id);

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Cancelled));
    }

    function test_Cancel_EmitsCancelledEvent() public {
        uint256 id = _createShipment();
        vm.prank(forwarder);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit AirCargoEscrow.Cancelled(id);
        escrow.cancel(id);
    }

    /// TC-14: Subsequent fund after cancel reverts WrongStatus
    function test_Cancel_ThenFund_Reverts() public {
        uint256 id = _createShipment();
        vm.prank(forwarder);
        escrow.cancel(id);

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(AirCargoEscrow.WrongStatus.selector);
        escrow.fund(id);
        vm.stopPrank();
    }

    /// TC-6: Non-forwarder calling cancel reverts NotForwarder
    function test_Cancel_NonForwarder_Reverts() public {
        uint256 id = _createShipment();
        vm.prank(stranger);
        vm.expectRevert(AirCargoEscrow.NotForwarder.selector);
        escrow.cancel(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  8. setMaxAmount (admin)
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetMaxAmount_UpdatesValue() public {
        vm.prank(owner);
        escrow.setMaxAmount(20_000_000);
        assertEq(escrow.maxAmount(), 20_000_000);
    }

    function test_SetMaxAmount_EmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(escrow));
        emit AirCargoEscrow.MaxAmountUpdated(20_000_000);
        escrow.setMaxAmount(20_000_000);
    }

    function test_SetMaxAmount_NonOwner_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        escrow.setMaxAmount(20_000_000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  9. setPaused — TC-12
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetPaused_BlocksCreateShipment() public {
        vm.prank(owner);
        escrow.setPaused(true);

        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.Paused.selector);
        escrow.createShipment(AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline());
    }

    function test_SetPaused_BlocksFund() public {
        uint256 id = _createShipment();

        vm.prank(owner);
        escrow.setPaused(true);

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(AirCargoEscrow.Paused.selector);
        escrow.fund(id);
        vm.stopPrank();
    }

    function test_SetPaused_AllowsCancel() public {
        uint256 id = _createShipment();

        vm.prank(owner);
        escrow.setPaused(true);

        // cancel has no pause guard — it must succeed while paused
        vm.prank(forwarder);
        escrow.cancel(id);

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Cancelled));
    }

    /// TC-12 — confirmDelivery is always allowed regardless of pause state.
    function test_SetPaused_AllowsConfirmDelivery() public {
        uint256 id = _createAndFund();

        vm.prank(owner);
        escrow.setPaused(true);

        // confirmDelivery has no pause guard — must succeed while paused
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        // carrier gets 70 % of 5_000_000 = 3_500_000
        assertEq(escrow.claimable(carrier), 3_500_000, "carrier claimable mismatch");
        // handler gets remainder: 5_000_000 - 3_500_000 = 1_500_000
        assertEq(escrow.claimable(handler), 1_500_000, "handler claimable mismatch");
    }

    /// TC-12 — refund is always allowed regardless of pause state.
    function test_SetPaused_AllowsRefund() public {
        uint256 id = _createAndFund();
        (, , , , , , , uint64 dl, ) = escrow.shipments(id);
        vm.warp(uint256(dl) + 1);

        vm.prank(owner);
        escrow.setPaused(true);

        uint256 balBefore = usdc.balanceOf(forwarder);

        // refund has no pause guard — must succeed while paused
        vm.prank(forwarder);
        escrow.refund(id);

        // forwarder gets their USDC back
        assertEq(usdc.balanceOf(forwarder), balBefore + AMOUNT, "forwarder USDC not returned");

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Refunded));
    }

    /// TC-12 — claim is always allowed regardless of pause state.
    function test_SetPaused_AllowsClaim() public {
        uint256 id = _createAndFund();

        // create + fund + confirmDelivery all happen before pause
        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        vm.prank(owner);
        escrow.setPaused(true);

        // claim has no pause guard — must succeed while paused
        vm.prank(carrier);
        escrow.claim();

        // carrier receives their 70 % share
        assertEq(usdc.balanceOf(carrier), 3_500_000, "carrier USDC balance mismatch");
        assertEq(escrow.claimable(carrier), 0, "carrier claimable not cleared");
    }

    /// TC-12 — setPaused(false) unblocks createShipment
    function test_SetPaused_Unpause_UnblocksCreateShipment() public {
        vm.prank(owner);
        escrow.setPaused(true);

        vm.prank(owner);
        escrow.setPaused(false);

        // Should no longer revert
        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline()
        );
        assertEq(id, 0);
    }

    function test_SetPaused_EmitsPausedUpdated() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(escrow));
        emit AirCargoEscrow.PausedUpdated(true);
        escrow.setPaused(true);
    }

    function test_SetPaused_NonOwner_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        escrow.setPaused(true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  10. Reentrancy — TC-13
    // ═══════════════════════════════════════════════════════════════════════

    function test_Claim_ReentrancyBlocked() public {
        // 1. Deploy the reentrant ERC-20 (initially unarmed) and a fresh escrow.
        ReentrantERC20 rToken = new ReentrantERC20();
        AirCargoEscrow rEscrow = new AirCargoEscrow(address(rToken), owner);

        // 2. Point the token's re-entry target at the new escrow (but don't arm yet).
        rToken.setTarget(address(rEscrow));

        // 3. Mint & fund unarmed so setUp completes without spurious re-entry.
        rToken.mint(forwarder, AMOUNT);

        vm.startPrank(forwarder);
        uint256 id = rEscrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline()
        );
        rToken.approve(address(rEscrow), AMOUNT);
        rEscrow.fund(id); // transferFrom — unarmed, no re-entry
        vm.stopPrank();

        vm.prank(forwarder);
        rEscrow.confirmDelivery(id); // credits claimable[carrier]

        // 4. Arm the hook just before the attack.  When carrier calls claim(),
        //    the escrow does safeTransfer → rToken.transfer → _transfer (armed)
        //    → rEscrow.claim() again.  The ReentrancyGuard fires on that inner
        //    call, its revert propagates through safeTransfer, causing the outer
        //    claim() to also revert.
        rToken.arm();

        vm.prank(carrier);
        vm.expectRevert(); // outer claim() reverts due to the re-entrant inner revert
        rEscrow.claim();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  11. Fuzz test — TC-17
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Verifies that carrierAmt + handlerAmt == amount for all valid inputs.
    function testFuzz_SplitAlwaysSumsToAmount(
        uint256 amount,
        uint16 carrierBps
    ) public {
        // Constrain to valid domain
        amount     = bound(amount, 1, MAX_AMOUNT);
        carrierBps = uint16(bound(uint256(carrierBps), 0, 10_000));
        uint16 handlerBps = uint16(10_000 - carrierBps);

        usdc.mint(forwarder, amount); // extra mint for each fuzz run

        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, carrierBps, handlerBps, amount, _deadline()
        );

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), amount);
        escrow.fund(id);
        vm.stopPrank();

        vm.prank(forwarder);
        escrow.confirmDelivery(id);

        uint256 carrierAmt = escrow.claimable(carrier);
        uint256 handlerAmt = escrow.claimable(handler);

        // PROPERTY: split must sum exactly to the escrowed amount
        assertEq(carrierAmt + handlerAmt, amount, "split does not sum to amount");
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  12. Multiple shipments — claimable accumulates across releases
    // ═══════════════════════════════════════════════════════════════════════

    function test_ClaimableAccumulatesAcrossShipments() public {
        // Two shipments, same carrier/handler, same split
        uint256 id0 = _createAndFund();
        uint256 id1;

        // Create and fund second shipment
        vm.prank(forwarder);
        id1 = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, _deadline()
        );
        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fund(id1);
        vm.stopPrank();

        vm.prank(forwarder);
        escrow.confirmDelivery(id0);
        vm.prank(forwarder);
        escrow.confirmDelivery(id1);

        // Each release adds 3_500_000 to carrier
        assertEq(escrow.claimable(carrier), 7_000_000);
        assertEq(escrow.claimable(handler), 3_000_000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  GROUP 1 — fund() deadline guard
    //  fund() must revert DeadlineInPast when block.timestamp >= shipment.deadline
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a shipment with deadline = block.timestamp + 1 days.
    /// Warp to EXACTLY deadline.  fund() must revert DeadlineInPast because
    /// the contract condition is `block.timestamp >= shipment.deadline`.
    function test_Fund_AtDeadline_Reverts() public {
        uint64 dl = uint64(block.timestamp + 1 days);

        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl
        );

        vm.warp(uint256(dl)); // block.timestamp == deadline  →  >= fires → revert

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(AirCargoEscrow.DeadlineInPast.selector);
        escrow.fund(id);
        vm.stopPrank();
    }

    /// Warp to deadline + 1 second (strictly past).  fund() must revert DeadlineInPast.
    function test_Fund_PastDeadline_Reverts() public {
        uint64 dl = uint64(block.timestamp + 1 days);

        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl
        );

        vm.warp(uint256(dl) + 1); // one second past deadline → revert

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(AirCargoEscrow.DeadlineInPast.selector);
        escrow.fund(id);
        vm.stopPrank();
    }

    /// Warp to deadline - 1 second (still inside window).  fund() must succeed
    /// and leave the shipment in Funded status.
    function test_Fund_BeforeDeadline_Succeeds() public {
        uint64 dl = uint64(block.timestamp + 1 days);

        vm.prank(forwarder);
        uint256 id = escrow.createShipment(
            AWB_REF, carrier, handler, CARRIER_BPS, HANDLER_BPS, AMOUNT, dl
        );

        vm.warp(uint256(dl) - 1); // one second before deadline → still valid

        vm.startPrank(forwarder);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fund(id);
        vm.stopPrank();

        (, , , , , , , , AirCargoEscrow.Status status) = escrow.shipments(id);
        assertEq(uint8(status), uint8(AirCargoEscrow.Status.Funded));
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  GROUP 2 — uint256 cast on bps sum
    //  The contract casts carrierBps and handlerBps to uint256 before adding
    //  so that a sum that overflows uint16 is NOT silently truncated to 10 000.
    // ═══════════════════════════════════════════════════════════════════════

    /// carrierBps=60000, handlerBps=5536.  Sum = 65 536 = 0 (mod 2^16).
    /// Without the uint256 cast this would have passed the 10 000 check
    /// (the lower 16 bits are 0, and 0 != 10000).  With the cast the true
    /// sum 65 536 != 10 000 so the contract reverts BpsNotFull.
    function test_CreateShipment_BpsOverflow_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.BpsNotFull.selector);
        escrow.createShipment(
            AWB_REF, carrier, handler,
            60_000,  // carrierBps  (uint16 max-range value)
            5_536,   // handlerBps  (60000 + 5536 = 65536 = 0x10000, lower 16 bits == 0)
            AMOUNT, _deadline()
        );
    }

    /// Both values at uint16 max (65535 each).  Sum = 131 070 != 10 000 → BpsNotFull.
    function test_CreateShipment_BpsMaxValues_Reverts() public {
        vm.prank(forwarder);
        vm.expectRevert(AirCargoEscrow.BpsNotFull.selector);
        escrow.createShipment(
            AWB_REF, carrier, handler,
            65_535,  // uint16 max
            65_535,  // uint16 max
            AMOUNT, _deadline()
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  GROUP 3 — Ownable2Step
    //  transferOwnership is a two-step process: the new owner must call
    //  acceptOwnership() before the handover is final.
    // ═══════════════════════════════════════════════════════════════════════

    address internal newOwner = makeAddr("newOwner");

    /// After owner calls transferOwnership(newOwner):
    ///   - pendingOwner() == newOwner
    ///   - owner()        == original owner  (not yet transferred)
    function test_Ownable2Step_TransferRequiresAccept() public {
        vm.prank(owner);
        escrow.transferOwnership(newOwner);

        assertEq(escrow.pendingOwner(), newOwner,  "pendingOwner should be newOwner");
        assertEq(escrow.owner(),        owner,     "owner should still be original owner");
    }

    /// After newOwner calls acceptOwnership(), owner() must become newOwner.
    function test_Ownable2Step_AcceptCompletes() public {
        vm.prank(owner);
        escrow.transferOwnership(newOwner);

        vm.prank(newOwner);
        escrow.acceptOwnership();

        assertEq(escrow.owner(), newOwner, "owner should be newOwner after acceptance");
    }

    /// A third address (not the pending owner) cannot steal ownership by
    /// calling acceptOwnership().
    function test_Ownable2Step_NonPendingCannotAccept() public {
        vm.prank(owner);
        escrow.transferOwnership(newOwner);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        escrow.acceptOwnership();
    }

    /// A non-owner cannot initiate a transfer at all — the standard Ownable
    /// access check still applies on transferOwnership().
    function test_Ownable2Step_DirectTransferSingleStep_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        escrow.transferOwnership(newOwner);
    }
}

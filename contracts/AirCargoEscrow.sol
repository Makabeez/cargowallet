// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @notice Escrows USDC for air-cargo shipments and releases funds on delivery confirmation with two-step ownership transfer.
 * USDC is handled at 6 ERC-20 decimals throughout this contract.
 */
contract AirCargoEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Created,
        Funded,
        Released,
        Refunded,
        Cancelled
    }

    struct Shipment {
        bytes32 awbRef;
        address forwarder;
        address carrier;
        address handler;
        uint16 carrierBps;
        uint16 handlerBps;
        uint256 amount;
        uint64 deadline;
        Status status;
    }

    error NotForwarder();
    error WrongStatus();
    error BpsNotFull();
    error DeadlineNotPassed();
    error DeadlineInPast();
    error AmountExceedsCap();
    error Paused();
    error ZeroAmount();
    error ZeroAddress();
    error NothingToClaim();

    event ShipmentCreated(
        uint256 indexed shipmentId,
        bytes32 indexed awbRef,
        address indexed forwarder,
        address carrier,
        address handler,
        uint16 carrierBps,
        uint16 handlerBps,
        uint256 amount,
        uint64 deadline
    );
    event Funded(uint256 indexed shipmentId, uint256 amount);
    event Released(uint256 indexed shipmentId, uint256 carrierAmt, uint256 handlerAmt);
    event Refunded(uint256 indexed shipmentId, uint256 amount);
    event Cancelled(uint256 indexed shipmentId);
    event MaxAmountUpdated(uint256 newMax);
    event PausedUpdated(bool paused);
    event Claimed(address indexed recipient, uint256 amount);

    IERC20 public immutable usdc;
    mapping(uint256 => Shipment) public shipments;
    mapping(address => uint256) public claimable;
    uint256 public shipmentCount;
    uint256 public maxAmount;
    bool public paused;

    /**
     * @notice Initializes the escrow contract.
     * @param usdcToken The ERC-20 token address used for escrowed USDC payments.
     * @param initialOwner The initial owner authorized to manage admin parameters.
     */
    constructor(address usdcToken, address initialOwner) Ownable(initialOwner) {
        // Ownable already reverts on address(0) for initialOwner; guard usdcToken only.
        if (usdcToken == address(0)) revert ZeroAddress();

        usdc = IERC20(usdcToken);
        maxAmount = 10_000_000;
    }

    /**
     * @notice Creates a new shipment escrow agreement in Created state.
     * @param awbRef The keccak256 hash reference of the Air Waybill.
     * @param carrier The carrier recipient address.
     * @param handler The ground handler recipient address.
     * @param carrierBps Carrier share in basis points.
     * @param handlerBps Handler share in basis points.
     * @param amount Escrow amount in USDC 6-decimal units.
     * @param deadline UNIX timestamp after which refund is permitted if still funded.
     * @return shipmentId The newly assigned shipment identifier.
     */
    function createShipment(
        bytes32 awbRef,
        address carrier,
        address handler,
        uint16 carrierBps,
        uint16 handlerBps,
        uint256 amount,
        uint64 deadline
    ) external returns (uint256 shipmentId) {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxAmount) revert AmountExceedsCap();
        if (uint256(carrierBps) + uint256(handlerBps) != 10_000) revert BpsNotFull();
        if (carrier == address(0) || handler == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        shipmentId = shipmentCount;
        shipmentCount = shipmentId + 1;

        shipments[shipmentId] = Shipment({
            awbRef: awbRef,
            forwarder: msg.sender,
            carrier: carrier,
            handler: handler,
            carrierBps: carrierBps,
            handlerBps: handlerBps,
            amount: amount,
            deadline: deadline,
            status: Status.Created
        });

        emit ShipmentCreated(
            shipmentId,
            awbRef,
            msg.sender,
            carrier,
            handler,
            carrierBps,
            handlerBps,
            amount,
            deadline
        );
    }

    /**
     * @notice Funds a Created shipment by transferring USDC from the forwarder into escrow.
     * @dev Reverts with DeadlineInPast if the shipment's deadline has already passed at funding time.
     * @param shipmentId The shipment identifier.
     */
    function fund(uint256 shipmentId) external nonReentrant {
        if (paused) revert Paused();

        Shipment storage shipment = shipments[shipmentId];

        if (shipment.status != Status.Created) revert WrongStatus();
        if (msg.sender != shipment.forwarder) revert NotForwarder();
        if (block.timestamp >= shipment.deadline) revert DeadlineInPast();

        shipment.status = Status.Funded;
        usdc.safeTransferFrom(shipment.forwarder, address(this), shipment.amount);

        emit Funded(shipmentId, shipment.amount);
    }

    /**
     * @notice Confirms delivery and releases escrowed USDC to carrier and handler.
     * @param shipmentId The shipment identifier.
     */
    function confirmDelivery(uint256 shipmentId) external nonReentrant {
        Shipment storage shipment = shipments[shipmentId];

        if (shipment.status != Status.Funded) revert WrongStatus();
        if (msg.sender != shipment.forwarder) revert NotForwarder();

        shipment.status = Status.Released;

        uint256 carrierAmt = (shipment.amount * shipment.carrierBps) / 10_000;
        uint256 handlerAmt = shipment.amount - carrierAmt;

        claimable[shipment.carrier] += carrierAmt;
        claimable[shipment.handler] += handlerAmt;

        emit Released(shipmentId, carrierAmt, handlerAmt);
    }

    /**
     * @notice Claims pending USDC payout credited by released shipments.
     */
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    /**
     * @notice Refunds escrowed USDC to the forwarder after deadline if shipment remains funded.
     * @param shipmentId The shipment identifier.
     */
    function refund(uint256 shipmentId) external nonReentrant {
        Shipment storage shipment = shipments[shipmentId];

        if (shipment.status != Status.Funded) revert WrongStatus();
        if (msg.sender != shipment.forwarder) revert NotForwarder();
        if (block.timestamp <= shipment.deadline) revert DeadlineNotPassed();

        shipment.status = Status.Refunded;
        usdc.safeTransfer(shipment.forwarder, shipment.amount);

        emit Refunded(shipmentId, shipment.amount);
    }

    /**
     * @notice Cancels a Created shipment before it is funded.
     * @dev Deliberately unguarded by pause: users must always be able to cancel
     *      an unfunded shipment and recover access to their planned funds.
     * @param shipmentId The shipment identifier.
     */
    function cancel(uint256 shipmentId) external {
        Shipment storage shipment = shipments[shipmentId];

        if (shipment.status != Status.Created) revert WrongStatus();
        if (msg.sender != shipment.forwarder) revert NotForwarder();

        shipment.status = Status.Cancelled;

        emit Cancelled(shipmentId);
    }

    /**
     * @notice Updates the maximum allowable escrow amount per shipment.
     * @param newMax The new cap in USDC 6-decimal units.
     */
    function setMaxAmount(uint256 newMax) external onlyOwner {
        maxAmount = newMax;
        emit MaxAmountUpdated(newMax);
    }

    /**
     * @notice Updates the pause flag. When paused, createShipment and fund revert.
     *         confirmDelivery, refund, cancel, and claim are always callable so users
     *         can recover or settle their escrowed USDC regardless of pause state.
     * @param _paused True to pause intake, false to unpause.
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedUpdated(_paused);
    }
}

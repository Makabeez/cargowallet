/**
 * Integration test: decode the ShipmentCreated event from real mainnet logs.
 *
 * Contract: 0xb56aea1ab82aa8f675eb2fa59d418734046cd92f  (Arc Mainnet, chainId 5042)
 * Contract deployed at block 28548856.
 * We fetch logs in a 9999-block window starting at the deploy block — all early
 * shipments are in this range and the RPC's 10,000-block limit is respected.
 *
 * Run: bun test src/lib/escrowAbi.test.ts
 */

import { describe, it, expect } from 'bun:test'
import { createPublicClient, http, keccak256, toBytes, parseEventLogs, type Log } from 'viem'
import { arc } from 'viem/chains'
import { ESCROW_ABI } from './escrowAbi'
import { ESCROW_ADDRESS } from './chain'

const RPC = 'https://rpc.mainnet.arc.io'
const DEPLOY_BLOCK = 28548856n   // block where AirCargoEscrow was deployed
const LOG_WINDOW   = 9999n       // Arc RPC max range is 10,000 blocks

// keccak256("ShipmentCreated(uint256,bytes32,address,address,address,uint16,uint16,uint256,uint64)")
const SELECTOR = keccak256(toBytes(
  'ShipmentCreated(uint256,bytes32,address,address,address,uint16,uint16,uint256,uint64)'
))

/** Fetch all ShipmentCreated logs from the first window after deploy. */
async function fetchFirstShipmentLogs(): Promise<Log[]> {
  const client = createPublicClient({ chain: arc, transport: http(RPC) })
  return client.getLogs({
    address: ESCROW_ADDRESS as `0x${string}`,
    topics: [SELECTOR],
    fromBlock: DEPLOY_BLOCK,
    toBlock: DEPLOY_BLOCK + LOG_WINDOW,
  })
}

describe('ShipmentCreated event decoding', () => {
  it('selector matches expected keccak256 (no network needed)', () => {
    const recomputed = keccak256(toBytes(
      'ShipmentCreated(uint256,bytes32,address,address,address,uint16,uint16,uint256,uint64)'
    ))
    expect(SELECTOR).toBe(recomputed)
    expect(SELECTOR).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('fetches at least one ShipmentCreated log from mainnet', async () => {
    const logs = await fetchFirstShipmentLogs()
    expect(logs.length).toBeGreaterThan(0)
    console.log('Found', logs.length, 'ShipmentCreated log(s)')
    console.log('First tx:', logs[0].transactionHash)
    console.log('Actual topics[0]:', logs[0].topics[0])
    console.log('SELECTOR used for filter:', SELECTOR)
    // All returned logs must come from the escrow contract
    for (const log of logs) {
      expect(log.address.toLowerCase()).toBe(ESCROW_ADDRESS.toLowerCase())
    }
  })

  it('parseEventLogs with artifact ESCROW_ABI decodes shipmentId correctly', async () => {
    const logs = await fetchFirstShipmentLogs()
    expect(logs.length).toBeGreaterThan(0)

    // This is the primary path — was broken before the fix because the hand-written
    // ABI had the wrong event signature (wrong field order and missing fields).
    const parsed = parseEventLogs({ abi: ESCROW_ABI, eventName: 'ShipmentCreated', logs })
    expect(parsed.length).toBeGreaterThan(0)

    // First shipment ever = id 0
    expect(parsed[0].args.shipmentId).toBe(0n)
    expect(typeof parsed[0].args.forwarder).toBe('string')
    console.log('Decoded shipmentId:', parsed[0].args.shipmentId)
    console.log('Forwarder:', parsed[0].args.forwarder)
  })

  it('topic fallback BigInt(topics[1]) also extracts shipmentId', async () => {
    const logs = await fetchFirstShipmentLogs()
    expect(logs.length).toBeGreaterThan(0)

    const log = logs[0]
    // topics[1] is the first indexed arg (shipmentId), zero-padded 32-byte big-endian
    expect(log.topics[1]).toBeDefined()
    const shipmentId = BigInt(log.topics[1]!)
    expect(shipmentId).toBe(0n)
    console.log('Fallback shipmentId:', shipmentId)
  })
})

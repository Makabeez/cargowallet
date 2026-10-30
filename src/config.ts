/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig, fallback, custom } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, arc.rpcUrls.default.http[0])

// For Arc mainnet reads/receipts: prefer the injected wallet provider (avoids
// ad-blockers that block direct RPC calls), fall back to the two official public
// Arc mainnet endpoints.
function arcTransport() {
  const transports = []
  if (typeof window !== 'undefined' && window.ethereum) {
    transports.push(custom(window.ethereum))
  }
  transports.push(
    http('https://rpc.mainnet.arc.io'),
    http('https://rpc.mainnet.arc.io/'), // trailing-slash variant
  )
  return fallback(transports)
}

export const config = createConfig({
  chains: [arc, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arc.id]: arcTransport(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

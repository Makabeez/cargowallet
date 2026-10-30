/**
 * One-time entity secret registration.
 * Run: bun run scripts/register-entity-secret.ts
 * Reads CIRCLE_API_KEY from .env, generates a fresh 32-byte secret,
 * registers its ciphertext with Circle, writes the recovery file to
 * /home/user/app/.circle/recovery_file.dat, and appends
 * CIRCLE_ENTITY_SECRET to .env.
 * NEVER echoes secret values to stdout.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

// Load .env manually (bun doesn't auto-load .env for scripts run directly)
const envPath = path.join('/home/user/app', '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (!process.env[key]) process.env[key] = val
}

const apiKey = process.env.CIRCLE_API_KEY
if (!apiKey) {
  console.error('ERROR: CIRCLE_API_KEY not found in .env')
  process.exit(1)
}

// Guard: don't re-register if CIRCLE_ENTITY_SECRET already set
if (process.env.CIRCLE_ENTITY_SECRET?.length === 64) {
  console.log('CIRCLE_ENTITY_SECRET already set in .env — skipping registration.')
  console.log('To rotate, use the Circle Console recovery flow.')
  process.exit(0)
}

const recoveryDir = '/home/user/app/.circle'
fs.mkdirSync(recoveryDir, { recursive: true })

// Generate secret without printing it
const entitySecret = crypto.randomBytes(32).toString('hex')

console.log('Registering entity secret ciphertext with Circle...')

let response
try {
  response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: recoveryDir,
  })
} catch (err) {
  console.error('ERROR: registerEntitySecretCiphertext failed:', (err as Error).message)
  process.exit(1)
}

// Write recovery file (SDK may have already written it; ensure it's persisted)
const recoveryPath = path.join(recoveryDir, 'recovery_file.dat')
if (response.data?.recoveryFile && !fs.existsSync(recoveryPath)) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile, 'utf-8')
}

if (!fs.existsSync(recoveryPath)) {
  console.error('ERROR: Recovery file was not written — aborting before persisting secret.')
  process.exit(1)
}

// Persist secret to .env
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, 'utf-8')
process.env.CIRCLE_ENTITY_SECRET = entitySecret

// Reload to verify
console.log('Verifying registration with a read-only SDK call...')
try {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  })
  await client.listWalletSets({ pageSize: 1 })
  console.log('Verification: OK')
} catch (err) {
  console.error('ERROR: Verification failed after registration:', (err as Error).message)
  console.error('The secret was written to .env but the SDK call failed. Check the API key and try again.')
  process.exit(1)
}

console.log('Registration complete.')
console.log('Recovery file written to: .circle/recovery_file.dat')
console.log('CIRCLE_ENTITY_SECRET appended to .env')
console.log('')
console.log('ACTION REQUIRED: Download .circle/recovery_file.dat from the sandbox NOW.')
console.log('Also copy CIRCLE_ENTITY_SECRET from .env to a password manager.')
console.log('Both are required for account recovery. Circle cannot recover them.')

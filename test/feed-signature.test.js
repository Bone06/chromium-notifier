import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { verifySignedBuildFeed } from '../js/feed-signature.js'

test('verifySignedBuildFeed accepts exact bytes and rejects tampering', async () => {
  const keys = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  )
  const publicJwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey)
  const feedText = '{"schemaVersion":1}\n'
  const signature = await webcrypto.subtle.sign(
    { hash: 'SHA-256', name: 'ECDSA' },
    keys.privateKey,
    new TextEncoder().encode(feedText)
  )
  const document = JSON.stringify({
    algorithm: 'ECDSA-P256-SHA256',
    keyId: 'test-key',
    schemaVersion: 1,
    signature: Buffer.from(signature).toString('base64url')
  })
  assert.equal(await verifySignedBuildFeed(
    feedText, document, { 'test-key': publicJwk }
  ), true)
  await assert.rejects(
    verifySignedBuildFeed(`${feedText} `, document, { 'test-key': publicJwk }),
    /verification failed/
  )
})

test('verifySignedBuildFeed rejects unknown keys and malformed metadata', async () => {
  const document = JSON.stringify({
    algorithm: 'ECDSA-P256-SHA256', keyId: 'unknown', schemaVersion: 1,
    signature: 'A'.repeat(86)
  })
  await assert.rejects(verifySignedBuildFeed('{}', document), /Untrusted/)
  await assert.rejects(verifySignedBuildFeed('{}', '{}'), /Invalid/)
})

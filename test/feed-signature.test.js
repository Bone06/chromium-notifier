import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import {
  getFeedKeyRotationNotice,
  TRUSTED_FEED_KEYS,
  verifySignedBuildFeed
} from '../js/feed-signature.js'

test('release trusts the current and next feed signing keys', () => {
  assert.deepEqual(Object.keys(TRUSTED_FEED_KEYS), [
    'feed-2026-01',
    'feed-2026-02'
  ])
  for (const key of Object.values(TRUSTED_FEED_KEYS)) {
    assert.equal(key.kty, 'EC')
    assert.equal(key.crv, 'P-256')
    assert.match(key.x, /^[A-Za-z0-9_-]{43}$/)
    assert.match(key.y, /^[A-Za-z0-9_-]{43}$/)
  }
})

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
  ), 'test-key')
  await assert.rejects(
    verifySignedBuildFeed(`${feedText} `, document, { 'test-key': publicJwk }),
    /verification failed/
  )
})

test('rotation notice is limited to a verified outgoing key and scheduled cutover', () => {
  const rotation = {
    outgoingKeyId: 'old-key',
    incomingKeyId: 'new-key',
    cutoverAt: '2027-10-01T00:00:00Z'
  }
  assert.match(
    getFeedKeyRotationNotice('old-key', rotation),
    /2027-10-01 \(UTC\)/
  )
  assert.equal(getFeedKeyRotationNotice('new-key', rotation), null)
  assert.equal(getFeedKeyRotationNotice(null, rotation), null)
  assert.equal(getFeedKeyRotationNotice('old-key'), null)
  assert.equal(getFeedKeyRotationNotice('old-key', {
    ...rotation,
    cutoverAt: 'invalid'
  }), null)
})

test('verifySignedBuildFeed rejects unknown keys and malformed metadata', async () => {
  const document = JSON.stringify({
    algorithm: 'ECDSA-P256-SHA256', keyId: 'unknown', schemaVersion: 1,
    signature: 'A'.repeat(86)
  })
  await assert.rejects(verifySignedBuildFeed('{}', document), /Untrusted/)
  await assert.rejects(verifySignedBuildFeed('{}', '{}'), /Invalid/)
})

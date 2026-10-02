import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isTransientNetworkError,
  RequestTimeoutError,
  retryTransientRequest
} from '../js/utils.js'

test('request timeouts have a stable transient error type', () => {
  const error = new RequestTimeoutError('Chromatic Feed', 15000)
  assert.equal(error.name, 'RequestTimeoutError')
  assert.equal(error.message, 'Chromatic Feed timed out after 15000 ms')
  assert.equal(isTransientNetworkError(error), true)
  assert.equal(isTransientNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isTransientNetworkError(new Error('Invalid signature')), false)
})

test('transient requests retry once after the configured delay', async () => {
  const attempts = []
  const delays = []
  const result = await retryTransientRequest(
    async () => {
      attempts.push(attempts.length + 1)
      if (attempts.length === 1) throw new TypeError('Failed to fetch')
      return 'ok'
    },
    {
      delayMs: 123,
      waitForRetry: async delayMs => delays.push(delayMs)
    }
  )

  assert.equal(result, 'ok')
  assert.deepEqual(attempts, [1, 2])
  assert.deepEqual(delays, [123])
})

test('transient requests preserve permanent failures and retry limits', async () => {
  let permanentAttempts = 0
  await assert.rejects(
    retryTransientRequest(async () => {
      permanentAttempts += 1
      throw new Error('Invalid signature')
    }, { waitForRetry: async () => {} }),
    /Invalid signature/
  )
  assert.equal(permanentAttempts, 1)

  let transientAttempts = 0
  await assert.rejects(
    retryTransientRequest(async () => {
      transientAttempts += 1
      throw new RequestTimeoutError('Chromatic Feed', 15000)
    }, { waitForRetry: async () => {} }),
    /timed out/
  )
  assert.equal(transientAttempts, 2)
})

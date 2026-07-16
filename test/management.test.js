import assert from 'node:assert/strict'
import test from 'node:test'

import { getInstalledExtensions, getStoredConfig } from '../js/utils.js'

test('getInstalledExtensions filters Chrome management results', async t => {
  globalThis.chrome = {
    management: {
      getAll: callback => callback([
        { id: 'self', type: 'extension' },
        { id: 'kept', name: 'Kept extension', type: 'extension' },
        { id: 'theme', type: 'theme' },
        { id: 'app', type: 'packaged_app' }
      ])
    },
    runtime: { id: 'self' }
  }
  t.after(() => delete globalThis.chrome)

  assert.deepEqual(await getInstalledExtensions(), [
    { id: 'kept', name: 'Kept extension', type: 'extension' }
  ])
})

test('getStoredConfig persists a legacy storage migration once', async t => {
  const writes = []
  globalThis.chrome = {
    storage: {
      local: {
        get: callback => callback({ timestamp: 1000, versions: { win64: [] } }),
        set: async state => writes.push(state)
      }
    }
  }
  t.after(() => delete globalThis.chrome)

  const result = await getStoredConfig()
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.lastAttemptAt, 1000)
  assert.equal(result.lastSuccessAt, 1000)
  assert.deepEqual(writes, [result])
})

test('getStoredConfig does not rewrite current or future schemas', async t => {
  const writes = []
  globalThis.chrome = {
    storage: {
      local: {
        get: callback => callback({ schemaVersion: 2, custom: true }),
        set: async state => writes.push(state)
      }
    }
  }
  t.after(() => delete globalThis.chrome)

  assert.deepEqual(await getStoredConfig(), { schemaVersion: 2, custom: true })
  assert.deepEqual(writes, [])
})

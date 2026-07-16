import assert from 'node:assert/strict'
import test from 'node:test'

import { getInstalledExtensions } from '../js/utils.js'

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

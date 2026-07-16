import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareVersions,
  createExtensionUpdateBatches,
  createExtensionUpdateUrl,
  getExtensionDownloadUrl,
  getChromiumVersionStatus,
  hasExtensionUpdate,
  mapPlatformToArch,
  matchExtension,
  parseUpdateManifest
} from '../js/core.js'

test('parseUpdateManifest parses apps, update data and XML entities', () => {
  const result = parseUpdateManifest(`
    <?xml version="1.0"?>
    <gupdate xmlns="https://www.google.com/update2/response">
      <app appid="extension-one">
        <updatecheck status="ok" version="2.0.0" codebase="https://example.test/a.crx?x=1&amp;y=2" />
      </app>
      <app appid='extension-two'>
        <updatecheck status='noupdate' />
      </app>
    </gupdate>
  `)

  assert.deepEqual(result, [
    {
      app: { appid: 'extension-one' },
      updatecheck: {
        status: 'ok',
        version: '2.0.0',
        codebase: 'https://example.test/a.crx?x=1&y=2'
      }
    },
    {
      app: { appid: 'extension-two' },
      updatecheck: { status: 'noupdate' }
    }
  ])
})

test('parseUpdateManifest supports namespace-prefixed tags', () => {
  const [result] = parseUpdateManifest(`
    <x:gupdate><x:app appid="id"><x:updatecheck version="1.2.3" /></x:app></x:gupdate>
  `)

  assert.equal(result.app.appid, 'id')
  assert.equal(result.updatecheck.version, '1.2.3')
})

test('parseUpdateManifest rejects a non-update response', () => {
  assert.throws(
    () => parseUpdateManifest('<html>Not an update manifest</html>'),
    /Invalid extension update manifest/
  )
})

test('compareVersions compares dotted numeric versions', () => {
  assert.equal(compareVersions('120.0.1', '120.0.1.0'), 0)
  assert.ok(compareVersions('120.0.10', '120.0.2') > 0)
  assert.ok(compareVersions('119.9', '120.0') < 0)
})

test('getChromiumVersionStatus identifies update direction', () => {
  assert.equal(
    getChromiumVersionStatus('150.0.7871.100', '150.0.7871.125'),
    'update-available'
  )
  assert.equal(
    getChromiumVersionStatus('150.0.7871.125', '150.0.7871.125'),
    'current'
  )
  assert.equal(
    getChromiumVersionStatus('151.0.7900.10', '150.0.7871.125'),
    'local-newer'
  )
})

test('getChromiumVersionStatus rejects missing or malformed versions', () => {
  assert.equal(getChromiumVersionStatus(undefined, '150.0.0.0'), 'unknown')
  assert.equal(getChromiumVersionStatus('150.0.0.0', undefined), 'unknown')
  assert.equal(getChromiumVersionStatus('Chromium 150', '150.0.0.0'), 'unknown')
})

test('matchExtension only matches an extension with the same id and a version', () => {
  const extension = { id: 'one', version: '1.0.0' }
  assert.equal(matchExtension(extension)({ id: 'one', version: '2.0.0' }), true)
  assert.equal(matchExtension(extension)({ id: 'two', version: '2.0.0' }), false)
  assert.equal(matchExtension(extension)({ id: 'one' }), false)
})

test('hasExtensionUpdate only accepts a newer version for the same extension', () => {
  const extension = { id: 'one', version: '1.2.3' }
  assert.equal(hasExtensionUpdate(extension, { id: 'one', version: '1.2.4' }), true)
  assert.equal(hasExtensionUpdate(extension, { id: 'one', version: '1.2.2' }), false)
  assert.equal(hasExtensionUpdate(extension, { id: 'two', version: '9.0.0' }), false)
  assert.equal(
    hasExtensionUpdate(extension, {
      id: 'one',
      status: 'noupdate',
      version: '9.0.0'
    }),
    false
  )
})

test('createExtensionUpdateUrl preserves query parameters and appends ids', () => {
  const url = createExtensionUpdateUrl(
    'https://example.test/update?channel=stable',
    ['one', 'two'],
    '120.0.0.0'
  )

  assert.equal(url.searchParams.get('channel'), 'stable')
  assert.equal(url.searchParams.get('acceptformat'), 'crx2,crx3')
  assert.equal(url.searchParams.get('prodversion'), '120.0.0.0')
  assert.deepEqual(url.searchParams.getAll('x'), ['id=one&uc', 'id=two&uc'])
})

test('createExtensionUpdateBatches respects the URL length limit', () => {
  const ids = Array.from({ length: 20 }, (_, index) =>
    `extension-${index.toString().padStart(2, '0')}`
  )
  const batches = createExtensionUpdateBatches(
    'https://example.test/update?channel=stable',
    ids,
    '120.0.0.0',
    220
  )

  assert.ok(batches.length > 1)
  assert.deepEqual(batches.flat(), ids)
  batches.forEach(batch => {
    assert.ok(
      createExtensionUpdateUrl(
        'https://example.test/update?channel=stable',
        batch,
        '120.0.0.0'
      ).href.length <= 220
    )
  })
})

test('getExtensionDownloadUrl builds a Google redirect URL', () => {
  const url = new URL(
    getExtensionDownloadUrl(
      {
        id: 'extension-id',
        codebase: 'https://clients2.googleusercontent.com/crx/blobs/file.crx',
        updateUrl: 'https://clients2.google.com/service/update2/crx?source=test'
      },
      '120.0.0.0'
    )
  )

  assert.equal(url.searchParams.get('source'), 'test')
  assert.equal(url.searchParams.get('response'), 'redirect')
  assert.equal(url.searchParams.get('prodversion'), '120.0.0.0')
  assert.equal(
    url.searchParams.get('x'),
    'id=extension-id&installsource=ondemand&uc'
  )
})

test('getExtensionDownloadUrl leaves non-Google codebase URLs unchanged', () => {
  const codebase = 'https://example.test/extension.crx'
  assert.equal(
    getExtensionDownloadUrl({ codebase, updateUrl: 'https://example.test' }),
    codebase
  )
})

test('mapPlatformToArch maps supported platforms', () => {
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'win' }), 'win64')
  assert.equal(mapPlatformToArch({ arch: 'x86-32', os: 'win' }), 'win32')
  assert.equal(mapPlatformToArch({ arch: 'arm64', os: 'mac' }), 'mac')
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'linux' }), undefined)
})

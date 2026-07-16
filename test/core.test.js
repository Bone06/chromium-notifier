import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareVersions,
  createExtensionUpdateBatches,
  createExtensionUpdateUrl,
  getDefaultBadgeColors,
  getBadgePresentation,
  getBadgeStatus,
  getBuildSelectionStatus,
  getChromiumVersionStatus,
  getExtensionDownloadUrl,
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

test('getBuildSelectionStatus validates the selected platform and tag', () => {
  const versions = {
    win64: [{ tag: 'stable' }, { tag: 'development' }]
  }

  assert.equal(
    getBuildSelectionStatus({ arch: 'win64', tag: 'stable', versions }),
    'valid'
  )
  assert.equal(
    getBuildSelectionStatus({ arch: 'linux', tag: 'stable', versions }),
    'platform-unavailable'
  )
  assert.equal(
    getBuildSelectionStatus({ arch: 'win64', tag: 'removed', versions }),
    'tag-unavailable'
  )
})

test('getBuildSelectionStatus distinguishes incomplete and unloaded state', () => {
  assert.equal(getBuildSelectionStatus({}), 'platform-required')
  assert.equal(
    getBuildSelectionStatus({ arch: 'win64', versions: {} }),
    'tag-required'
  )
  assert.equal(
    getBuildSelectionStatus({ arch: 'win64', tag: 'stable', versions: {} }),
    'no-data'
  )
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

test('getBadgeStatus ignores stale extension updates when tracking is disabled', () => {
  const state = {
    availableVersion: '150.0.0.0',
    currentVersion: '150.0.0.0',
    extensions: [{ id: 'one', version: '1.0.0' }],
    extensionsInfo: [{ id: 'one', version: '2.0.0' }],
    extensionsTrack: false
  }

  assert.equal(getBadgeStatus(state), 'none')
  assert.equal(getBadgeStatus({ ...state, extensionsTrack: true }), 'extensions')
})

test('getBadgeStatus only reports a newer remote Chromium version', () => {
  assert.equal(
    getBadgeStatus({
      availableVersion: '150.0.0.1',
      currentVersion: '150.0.0.0'
    }),
    'chromium'
  )
  assert.equal(
    getBadgeStatus({
      availableVersion: '150.0.0.0',
      currentVersion: '150.0.0.0'
    }),
    'none'
  )
  assert.equal(
    getBadgeStatus({
      availableVersion: '149.0.0.0',
      currentVersion: '150.0.0.0'
    }),
    'none'
  )
})

test('getBadgeStatus distinguishes combined updates and errors', () => {
  const state = {
    availableVersion: '150.0.0.1',
    currentVersion: '150.0.0.0',
    extensions: [{ id: 'one', version: '1.0.0' }],
    extensionsInfo: [{ id: 'one', version: '2.0.0' }],
    extensionsTrack: true
  }

  assert.equal(getBadgeStatus(state), 'both')
  assert.equal(getBadgeStatus({ ...state, error: 'network error' }), 'error')
})

test('getBadgePresentation defines text, color and tooltip for every state', () => {
  assert.deepEqual(getBadgePresentation('chromium'), {
    color: [0, 150, 180, 255],
    text: 'New',
    title: 'A new Chromium version is available'
  })
  assert.deepEqual(getBadgePresentation('extensions'), {
    color: [194, 65, 12, 255],
    text: 'EXT',
    title: 'Extension updates are available'
  })
  assert.deepEqual(getBadgePresentation('both'), {
    color: [126, 34, 206, 255],
    text: 'NEW+',
    title: 'Chromium and extension updates are available'
  })
  assert.equal(getBadgePresentation('error').text, '!')
  assert.equal(getBadgePresentation('none').text, '')
})

test('getBadgePresentation applies valid custom colors when enabled', () => {
  assert.deepEqual(
    getBadgePresentation('extensions', {
      badgeColors: { extensions: '#123456' },
      useCustomColors: true
    }).color,
    [18, 52, 86, 255]
  )
  assert.deepEqual(
    getBadgePresentation('extensions', {
      badgeColors: { extensions: '#123456' },
      useCustomColors: false
    }).color,
    [194, 65, 12, 255]
  )
})

test('getBadgePresentation rejects invalid custom colors and exposes defaults', () => {
  assert.deepEqual(
    getBadgePresentation('both', {
      badgeColors: { both: 'purple' },
      useCustomColors: true
    }).color,
    [126, 34, 206, 255]
  )
  assert.deepEqual(getDefaultBadgeColors(), {
    both: '#7e22ce',
    chromium: '#0096b4',
    error: '#b40014',
    extensions: '#c2410c'
  })
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

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareVersions,
  CURRENT_SCHEMA_VERSION,
  createExtensionUpdateBatches,
  createExtensionUpdateUrl,
  extractChromiumVersion,
  filterRelevantExtensions,
  getDefaultBadgeColors,
  getBadgePresentation,
  getBadgeStatus,
  getBuildSelectionStatus,
  getCompactBuildName,
  getChromiumVersionStatus,
  getChromiumVersionFromUserAgentData,
  getExtensionDownloadUrl,
  getExtensionCapabilities,
  getInstallTypeLabel,
  getPlatformDisplayName,
  getBuildFeedErrorState,
  getBuildFeedSuccessState,
  hasExtensionUpdate,
  hasSnapshotRevisionUpdate,
  isBuildFeedRollback,
  mapPlatformToArch,
  matchExtension,
  migrateStoredConfig,
  parseUpdateManifest,
  validateBuildSourcesFeed
} from '../js/core.js'

const versionsFixture = {
  win64: [{
    links: [{ label: 'Archive', url: 'https://example.test/chromium.zip' }],
    revision: '1234567',
    tag: 'stable',
    timestamp: 1700000000,
    version: '150.0.0.1'
  }]
}

const buildSourceFeed = {
  builds: [{
    architecture: 'x64',
    capabilities: {
      official: true,
      proprietaryCodecs: true,
      sync: true,
      widevine: true
    },
    channel: 'stable',
    downloads: [{
      label: 'Archive',
      name: 'chrome.7z',
      size: 123,
      url: 'https://github.com/Hibbiki/chromium-win64/releases/download/v150.0.0.1-r1/chrome.7z'
    }],
    displayName: 'Hibbiki – Stable – Sync – All Codecs+',
    id: 'hibbiki-win64',
    platform: 'win64',
    publishedAt: '2026-07-17T12:00:00.000Z',
    releaseUrl: 'https://github.com/Hibbiki/chromium-win64/releases/tag/v150.0.0.1-r1',
    revision: '1',
    sourceId: 'hibbiki',
    tag: 'stable-codecs-sync',
    version: '150.0.0.1'
  }],
  generatedAt: '2026-07-17T12:00:00.000Z',
  schemaVersion: 1,
  sources: [{
    checkedAt: '2026-07-17T12:00:00.000Z',
    error: null,
    id: 'hibbiki',
    lastSuccessAt: '2026-07-17T12:00:00.000Z',
    name: 'Hibbiki/chromium-win64',
    repository: 'https://github.com/Hibbiki/chromium-win64/',
    stale: false
  }]
}

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

test('extractChromiumVersion accepts full and major-only user agents', () => {
  assert.equal(
    extractChromiumVersion('Mozilla/5.0 Chromium/150.0.7871.125 Safari/537.36'),
    '150.0.7871.125'
  )
  assert.equal(extractChromiumVersion('Custom Chrome/150'), '150')
  assert.equal(extractChromiumVersion('Custom Browser/150.0'), undefined)
})

test('getChromiumVersionFromUserAgentData prefers Chromium full versions', () => {
  assert.equal(
    getChromiumVersionFromUserAgentData({
      brands: [{ brand: 'Chromium', version: '150' }],
      fullVersionList: [
        { brand: 'Google Chrome', version: '150.0.0.1' },
        { brand: 'Chromium', version: '150.0.0.2' }
      ],
      uaFullVersion: '150.0.0.3'
    }),
    '150.0.0.2'
  )
})

test('getChromiumVersionFromUserAgentData uses safe fallbacks', () => {
  assert.equal(
    getChromiumVersionFromUserAgentData({ uaFullVersion: '151.0.0.1' }),
    '151.0.0.1'
  )
  assert.equal(
    getChromiumVersionFromUserAgentData({
      brands: [{ brand: 'Chromium', version: '152' }]
    }),
    '152'
  )
  assert.equal(
    getChromiumVersionFromUserAgentData({ uaFullVersion: 'invalid' }),
    undefined
  )
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

test('validateBuildSourcesFeed normalizes the versioned source feed', () => {
  const result = validateBuildSourcesFeed(buildSourceFeed)

  assert.equal(result.generatedAt, buildSourceFeed.generatedAt)
  assert.equal(result.versions.win64[0].version, '150.0.0.1')
  assert.equal(result.versions.win64[0].tag, 'stable-codecs-sync')
  assert.equal(
    result.versions.win64[0].displayName,
    'Hibbiki – Stable – Sync – All Codecs+'
  )
  assert.equal(result.versions.win64[0].source.name, 'Hibbiki/chromium-win64')
  assert.equal(result.versions.win64[0].source.stale, false)
  assert.equal(result.versions.win64[0].id, 'hibbiki-win64')
  assert.equal(result.versions.win64[0].channel, 'stable')
  assert.equal(result.versions.win64[0].timestamp, 1784289600)
})

test('getCompactBuildName keeps source and variant while removing repeated details', () => {
  assert.equal(
    getCompactBuildName('RobRich – Dev – AVX2 – Modified – All Codecs+ – DEB'),
    'RobRich – Dev – AVX2 – DEB'
  )
  assert.equal(
    getCompactBuildName('Hibbiki – Stable – Sync – All Codecs+'),
    'Hibbiki – Stable – Sync'
  )
})

test('validateBuildSourcesFeed falls back to tag and rejects unsafe display names', () => {
  const withoutDisplayName = structuredClone(buildSourceFeed)
  delete withoutDisplayName.builds[0].displayName
  assert.equal(
    validateBuildSourcesFeed(withoutDisplayName).versions.win64[0].displayName,
    'stable-codecs-sync'
  )

  const invalid = structuredClone(buildSourceFeed)
  invalid.builds[0].displayName = 'Unsafe\nlabel'
  assert.throws(() => validateBuildSourcesFeed(invalid), /builds\[0\] is invalid/)
})

test('validateBuildSourcesFeed rejects unsafe and inconsistent feeds', () => {
  assert.throws(
    () => validateBuildSourcesFeed({ ...buildSourceFeed, schemaVersion: 2 }),
    /schemaVersion 1/
  )
  assert.throws(
    () => validateBuildSourcesFeed({
      ...buildSourceFeed,
      builds: [{ ...buildSourceFeed.builds[0], sourceId: 'unknown' }]
    }),
    /builds\[0\] is invalid/
  )
  assert.throws(
    () => validateBuildSourcesFeed({
      ...buildSourceFeed,
      builds: [{
        ...buildSourceFeed.builds[0],
        downloads: [{
          ...buildSourceFeed.builds[0].downloads[0],
          url: 'javascript:alert(1)'
        }]
      }]
    }),
    /downloads\[0\] is invalid/
  )
})

test('parseUpdateManifest rejects oversized and unclosed manifests', () => {
  assert.throws(
    () => parseUpdateManifest(`<gupdate>${'<app '.repeat(100000)}`),
    /Invalid extension update manifest/
  )
  assert.throws(
    () => parseUpdateManifest('<gupdate><app appid="one">'),
    /Invalid extension update manifest/
  )
})

test('signed feed rollback detection rejects older generations', () => {
  assert.equal(isBuildFeedRollback(
    '2026-07-22T12:00:00Z', '2026-07-22T11:59:59Z'
  ), true)
  assert.equal(isBuildFeedRollback(
    '2026-07-22T12:00:00Z', '2026-07-22T12:00:00Z'
  ), false)
  assert.equal(isBuildFeedRollback(undefined, '2026-07-22T12:00:00Z'), false)
})

test('build feed state transitions track attempts and preserve cached data', () => {
  assert.deepEqual(getBuildFeedSuccessState(versionsFixture, 1000), {
    error: null,
    lastAttemptAt: 1000,
    lastErrorAt: null,
    lastSuccessAt: 1000,
    timestamp: 1000,
    versions: versionsFixture,
    woolyssDataStale: false,
    woolyssError: null
  })

  const failed = getBuildFeedErrorState(
    { lastSuccessAt: 1000, versions: versionsFixture },
    new Error('network failed'),
    2000
  )
  assert.deepEqual(failed, {
    error: null,
    lastAttemptAt: 2000,
    lastErrorAt: 2000,
    timestamp: 2000,
    woolyssDataStale: true,
    woolyssError: 'network failed'
  })
  assert.equal(Object.hasOwn(failed, 'versions'), false)
  assert.equal(
    getBuildFeedErrorState({}, new Error('first check failed'), 2000)
      .woolyssDataStale,
    false
  )
})

test('migrateStoredConfig upgrades legacy successful state', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1)
  assert.deepEqual(
    migrateStoredConfig({
      arch: 'win64',
      timestamp: 1000,
      versions: versionsFixture
    }),
    {
      arch: 'win64',
      error: null,
      lastAttemptAt: 1000,
      lastSuccessAt: 1000,
      schemaVersion: 1,
      timestamp: 1000,
      versions: versionsFixture
    }
  )
})

test('migrateStoredConfig preserves legacy error and cached data semantics', () => {
  assert.deepEqual(
    migrateStoredConfig({
      error: 'offline',
      timestamp: 2000,
      versions: versionsFixture
    }),
    {
      error: null,
      lastAttemptAt: 2000,
      schemaVersion: 1,
      timestamp: 2000,
      versions: versionsFixture,
      woolyssDataStale: true,
      woolyssError: 'offline'
    }
  )
})

test('migrateStoredConfig is idempotent and preserves future schemas', () => {
  const current = { custom: true, schemaVersion: 1 }
  const future = { custom: true, schemaVersion: 2 }
  assert.deepEqual(migrateStoredConfig(current), current)
  assert.deepEqual(migrateStoredConfig(future), future)
})

test('matchExtension only matches an extension with the same id and a version', () => {
  const extension = { id: 'one', version: '1.0.0' }
  assert.equal(matchExtension(extension)({ id: 'one', version: '2.0.0' }), true)
  assert.equal(matchExtension(extension)({ id: 'two', version: '2.0.0' }), false)
  assert.equal(matchExtension(extension)({ id: 'one' }), false)
})

test('filterRelevantExtensions keeps only other extensions', () => {
  const extensions = [
    { id: 'self', type: 'extension' },
    { id: 'other', type: 'extension' },
    { id: 'theme', type: 'theme' },
    { id: 'app', type: 'hosted_app' }
  ]

  assert.deepEqual(filterRelevantExtensions(extensions, 'self'), [
    { id: 'other', type: 'extension' }
  ])
})

test('getExtensionCapabilities respects management restrictions', () => {
  assert.deepEqual(
    getExtensionCapabilities({ enabled: true, mayDisable: false }),
    { canRemove: false, canToggle: false }
  )
  assert.deepEqual(
    getExtensionCapabilities({ enabled: false, mayDisable: true }),
    { canRemove: true, canToggle: true }
  )
  assert.deepEqual(
    getExtensionCapabilities({ enabled: false, mayEnable: false }),
    { canRemove: true, canToggle: false }
  )
})

test('getInstallTypeLabel identifies non-standard installations', () => {
  assert.equal(getInstallTypeLabel('admin'), 'Managed')
  assert.equal(getInstallTypeLabel('development'), 'Unpacked')
  assert.equal(getInstallTypeLabel('sideload'), 'Sideloaded')
  assert.equal(getInstallTypeLabel('normal'), null)
  assert.equal(getInstallTypeLabel('other'), null)
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

test('snapshot revision notifications require opt-in and a newer revision', () => {
  const current = { channel: 'snapshot', id: 'snapshot-win64', revision: '12' }
  assert.equal(hasSnapshotRevisionUpdate({
    current, notifySnapshotRevisions: false,
    snapshotRevisionsSeen: { 'snapshot-win64': '11' }
  }), false)
  assert.equal(hasSnapshotRevisionUpdate({
    current, notifySnapshotRevisions: true,
    snapshotRevisionsSeen: { 'snapshot-win64': '11' }
  }), true)
  assert.equal(getBadgeStatus({ snapshotRevisionUpdate: true }), 'chromium')
})

test('getBadgeStatus keeps known updates visible when a later check fails', () => {
  const state = {
    availableVersion: '150.0.0.1',
    currentVersion: '150.0.0.0',
    extensions: [{ id: 'one', version: '1.0.0' }],
    extensionsInfo: [{ id: 'one', version: '2.0.0' }],
    extensionsTrack: true
  }

  assert.equal(getBadgeStatus(state), 'both')
  assert.equal(
    getBadgeStatus({ ...state, woolyssError: 'network error' }),
    'both'
  )
  assert.equal(getBadgeStatus({ woolyssError: 'network error' }), 'error')
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

test('getBadgePresentation marks cached Chromium data in the tooltip', () => {
  assert.equal(
    getBadgePresentation('chromium', { woolyssDataStale: true }).title,
    'A new Chromium version is available — Latest Chromium check failed; using cached data'
  )
  assert.match(
    getBadgePresentation('none', { hasStaleBuildSource: true }).title,
    /selected build source is using cached data/
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

test('createExtensionUpdateUrl omits an unavailable browser version', () => {
  const url = createExtensionUpdateUrl(
    'https://example.test/update',
    ['one'],
    undefined
  )
  assert.equal(url.searchParams.has('prodversion'), false)
})

test('createExtensionUpdateUrl rejects non-HTTP update servers', () => {
  assert.throws(
    () => createExtensionUpdateUrl('file:///tmp/update.xml', ['one']),
    /Invalid extension update URL/
  )
})

test('createExtensionUpdateUrl rejects local, private and credentialed servers', () => {
  const unsafeUrls = [
    'http://localhost/update',
    'http://127.0.0.1/update',
    'http://2130706433/update',
    'http://[::1]/update',
    'http://10.0.0.1/update',
    'http://169.254.169.254/update',
    'https://user:secret@example.test/update'
  ]

  unsafeUrls.forEach(updateUrl => assert.throws(
    () => createExtensionUpdateUrl(updateUrl, ['one']),
    /Invalid extension update URL/
  ))
})

test('getExtensionDownloadUrl rejects unsafe download targets', () => {
  assert.equal(getExtensionDownloadUrl({
    codebase: 'http://127.0.0.1/extension.crx'
  }), null)
  assert.equal(getExtensionDownloadUrl({
    codebase: 'https://user:secret@example.test/extension.crx'
  }), null)
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

test('getExtensionDownloadUrl rejects unsafe URLs and checks exact hostnames', () => {
  assert.equal(
    getExtensionDownloadUrl({ codebase: 'javascript:alert(1)' }),
    null
  )

  const deceptive =
    'https://example.test/clients2.googleusercontent.com/extension.crx'
  assert.equal(
    getExtensionDownloadUrl({ codebase: deceptive }),
    deceptive
  )
})

test('mapPlatformToArch maps supported platforms', () => {
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'win' }), 'win64')
  assert.equal(mapPlatformToArch({ arch: 'x86-32', os: 'win' }), undefined)
  assert.equal(mapPlatformToArch({ arch: 'arm64', os: 'win' }), 'winarm64')
  assert.equal(mapPlatformToArch({ arch: 'arm64', os: 'mac' }), 'macarm64')
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'mac' }), 'mac')
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'linux' }), 'linux')
  assert.equal(mapPlatformToArch({ arch: 'arm64', os: 'linux' }), undefined)
  assert.equal(mapPlatformToArch({ arch: 'arm64', os: 'android' }), undefined)
  assert.equal(mapPlatformToArch({ arch: 'x86-64', os: 'cros' }), undefined)
})

test('getPlatformDisplayName combines friendly and technical names', () => {
  assert.equal(getPlatformDisplayName('winarm64'), 'Windows ARM64 - winarm64')
  assert.equal(
    getPlatformDisplayName('macarm64'),
    'macOS Apple Silicon - macarm64'
  )
  assert.equal(getPlatformDisplayName('future'), 'future')
})

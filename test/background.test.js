import assert from 'node:assert/strict'
import test from 'node:test'

const createEvent = () => {
  const listeners = []
  return {
    addListener: listener => listeners.push(listener),
    listeners
  }
}

const createBuildFeed = version => ({
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
      url: `https://github.com/Hibbiki/chromium-win64/releases/download/v${version}-r1/chrome.7z`
    }],
    id: 'hibbiki-win64',
    platform: 'win64',
    publishedAt: '2026-07-17T12:00:00.000Z',
    releaseUrl: `https://github.com/Hibbiki/chromium-win64/releases/tag/v${version}-r1`,
    revision: '1',
    sourceId: 'hibbiki',
    tag: 'stable-codecs-sync',
    version
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
})

test('background registers listeners, deduplicates checks and isolates extension failures', async t => {
  const originalDebug = console.debug
  const originalError = console.error
  const originalFetch = globalThis.fetch
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator'
  )
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const events = {
    alarm: createEvent(),
    installed: createEvent(),
    message: createEvent(),
    startup: createEvent(),
    storage: createEvent()
  }
  const actionCalls = []
  const storageWrites = []
  let extensions = []
  let fetchCalls = 0
  let fetchImplementation
  const store = {
    arch: 'win64',
    extensionsTrack: true,
    schemaVersion: 1,
    tag: 'stable-codecs-sync'
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: true,
      userAgent: 'Chromium/150.0.0.0',
      userAgentData: {
        brands: [{ brand: 'Chromium', version: '150' }],
        getHighEntropyValues: async () => ({
          fullVersionList: [{
            brand: 'Chromium',
            version: '150.0.0.0'
          }]
        })
      }
    }
  })
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      subtle: {
        importKey: async () => ({}),
        verify: async () => true
      }
    }
  })
  console.debug = () => {}
  console.error = () => {}
  globalThis.fetch = (...args) => {
    fetchCalls += 1
    return fetchImplementation(...args)
  }
  globalThis.chrome = {
    action: {
      setBadgeBackgroundColor: value => actionCalls.push(['color', value]),
      setBadgeText: value => actionCalls.push(['text', value]),
      setTitle: value => actionCalls.push(['title', value])
    },
    alarms: {
      create: async () => {},
      get: async () => null,
      onAlarm: events.alarm
    },
    management: {
      get: (id, callback) => callback({ id, type: 'extension', version: '4.0.0' }),
      getAll: callback => callback(extensions)
    },
    runtime: {
      getPlatformInfo: callback => callback({ arch: 'x86-64', os: 'win' }),
      id: 'self',
      onInstalled: events.installed,
      onMessage: events.message,
      onStartup: events.startup
    },
    storage: {
      local: {
        get: callback => callback({ ...store }),
        set: async state => {
          Object.assign(store, state)
          storageWrites.push(state)
        }
      },
      onChanged: events.storage
    }
  }
  t.after(() => {
    delete globalThis.chrome
    console.debug = originalDebug
    console.error = originalError
    globalThis.fetch = originalFetch
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    } else {
      delete globalThis.crypto
    }
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    } else {
      delete globalThis.navigator
    }
  })

  await import('../js/background.js')
  assert.equal(events.alarm.listeners.length, 1)
  assert.equal(events.message.listeners.length, 1)
  assert.equal(events.startup.listeners.length, 1)
  assert.equal(events.storage.listeners.length, 1)

  const pendingFetches = []
  fetchImplementation = url => new Promise(resolve => {
    pendingFetches.push({ resolve, url: String(url) })
  })
  events.alarm.listeners[0]({ name: 'main' })
  const manualResponse = new Promise(resolve => {
    assert.equal(
      events.message.listeners[0]({ type: 'check-now' }, {}, resolve),
      true
    )
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetchCalls, 1)
  assert.equal(
    pendingFetches[0].url,
    'https://bone06.ddns.net/chromium/versions.json'
  )
  pendingFetches[0].resolve(new Response(
    JSON.stringify(createBuildFeed('150.0.0.1')),
    { headers: { etag: '"feed-1"' } }
  ))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(fetchCalls, 2)
  assert.equal(
    pendingFetches[1].url,
    'https://bone06.ddns.net/chromium/versions.json.sig'
  )
  pendingFetches[1].resolve(new Response(JSON.stringify({
    algorithm: 'ECDSA-P256-SHA256', keyId: 'feed-2026-01',
    schemaVersion: 1, signature: 'A'.repeat(86)
  })))
  assert.deepEqual(await manualResponse, { ok: true })
  assert.equal(store.versions.win64[0].version, '150.0.0.1')
  assert.equal(store.buildFeedEtag, '"feed-1"')

  extensions = [{
    id: 'broken',
    type: 'extension',
    updateUrl: 'file:///invalid-update.xml'
  }]
  fetchImplementation = async url => String(url).endsWith('.sig')
    ? new Response(JSON.stringify({
          algorithm: 'ECDSA-P256-SHA256', keyId: 'feed-2026-01',
          schemaVersion: 1, signature: 'A'.repeat(86)
        }))
    : new Response(JSON.stringify(createBuildFeed('150.0.0.2')), {
        headers: { etag: '"feed-2"' }
      })
  const isolatedResponse = new Promise(resolve => {
    events.message.listeners[0]({ type: 'check-now' }, {}, resolve)
  })
  assert.deepEqual(await isolatedResponse, { ok: true })
  assert.equal(store.versions.win64[0].version, '150.0.0.2')
  assert.equal(store.buildFeedEtag, '"feed-2"')
  assert.match(store.extensionsGeneralError, /Invalid extension update URL/)

  extensions = []
  const fetchesBeforeNotModified = fetchCalls
  let conditionalHeader
  fetchImplementation = async (_url, init) => {
    conditionalHeader = new Headers(init.headers).get('if-none-match')
    return new Response(null, { status: 304 })
  }
  const notModifiedResponse = new Promise(resolve => {
    events.message.listeners[0]({ type: 'check-now' }, {}, resolve)
  })
  assert.deepEqual(await notModifiedResponse, { ok: true })
  assert.equal(fetchCalls, fetchesBeforeNotModified + 1)
  assert.equal(conditionalHeader, '"feed-2"')
  assert.equal(store.versions.win64[0].version, '150.0.0.2')
  assert.equal(store.woolyssError, null)

  await events.storage.listeners[0]({}, 'local')
  assert.ok(actionCalls.some(([type]) => type === 'text'))
  assert.ok(storageWrites.length >= 2)
})

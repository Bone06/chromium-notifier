import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'

const flush = () => new Promise(resolve => setImmediate(resolve))

test('popup renders the tracked build and handles refresh and theme changes', async t => {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>')
  const previous = Object.fromEntries(
    ['chrome', 'document', 'navigator', 'window'].map(name => [
      name, Object.getOwnPropertyDescriptor(globalThis, name)
    ])
  )
  const storageListeners = new Set()
  const managementListeners = () => ({
    addListener () {},
    removeListener () {}
  })
  const store = {
    extensionsTrack: false,
    schemaVersion: 1,
    tag: 'stable-codecs-sync',
    themeMode: 'light',
    versions: {
      win64: [{
        channel: 'stable',
        displayName: 'Hibbiki – Stable',
        id: 'hibbiki-win64',
        links: [{ label: 'Archive', url: 'https://example.com/chrome.7z' }],
        releaseUrl: 'https://example.com/release',
        revision: '123',
        source: { name: 'Hibbiki/chromium-win64' },
        tag: 'stable-codecs-sync',
        timestamp: 1_780_000_000,
        version: '150.0.0.0'
      }]
    }
  }
  const snapshotBuild = {
    ...store.versions.win64[0], id: 'snapshot-test', tag: 'snapshot',
    channel: 'snapshot', revision: '100'
  }
  store.versions.win64.push(snapshotBuild)
  let respondToCheck
  const chrome = {
    management: {
      get: (_id, callback) => callback({ id: 'self', version: '4.1.0' }),
      getAll: callback => callback([]),
      onDisabled: managementListeners(),
      onEnabled: managementListeners(),
      onInstalled: managementListeners(),
      onUninstalled: managementListeners()
    },
    runtime: {
      getPlatformInfo: callback => callback({ arch: 'x86-64', os: 'win' }),
      id: 'self',
      sendMessage: (message, callback) => {
        assert.deepEqual(message, { type: 'check-now' })
        respondToCheck = callback
      }
    },
    storage: {
      local: {
        get: (keys, callback) => {
          if (typeof keys === 'function') keys({ ...store })
          else callback({ ...store })
        },
        set: async values => {
          const changes = Object.fromEntries(
            Object.entries(values).map(([key, newValue]) => [key, { newValue }])
          )
          Object.assign(store, values)
          for (const listener of storageListeners) listener(changes, 'local')
        }
      },
      onChanged: {
        addListener: listener => storageListeners.add(listener),
        removeListener: listener => storageListeners.delete(listener)
      }
    }
  }

  Object.defineProperties(globalThis, {
    chrome: { configurable: true, value: chrome },
    document: { configurable: true, value: document },
    navigator: {
      configurable: true,
      value: {
        userAgent: 'Chromium/150.0.0.0',
        userAgentData: {
          brands: [{ brand: 'Chromium', version: '150' }],
          getHighEntropyValues: async () => ({
            fullVersionList: [{ brand: 'Chromium', version: '150.0.0.0' }]
          })
        }
      }
    },
    window: { configurable: true, value: window }
  })
  t.after(async () => {
    const { render } = await import('../js/vendor/preact-11.0.2.mjs')
    render(null, document.getElementById('app'))
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })

  await import('../js/popup.js')
  await flush()
  await flush()

  const app = document.getElementById('app')
  assert.match(app.textContent, /Chromium Update Notifications/)
  assert.match(app.textContent, /Hibbiki\/chromium-win64/)
  assert.match(app.textContent, /Revision: 123/)
  assert.equal(app.querySelector('a[href="https://example.com/chrome.7z"]')?.textContent, 'Archive')

  const checkButton = app.querySelector('button.check-now')
  assert.equal(checkButton.closest('summary'), null)
  checkButton.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }))
  await flush()
  assert.equal(checkButton.getAttribute('aria-busy'), 'true')
  assert.match(app.textContent, /Checking…/)
  respondToCheck({ ok: true })
  await flush()
  await flush()
  assert.equal(app.querySelector('button.check-now').getAttribute('aria-busy'), 'false')
  assert.match(app.textContent, /Check now/)

  const themeSelect = app.querySelector('.theme-setting select')
  const accentSelect = app.querySelector('.accent-setting select')
  assert.equal(accentSelect.value, 'blue')
  accentSelect.querySelector('option[value="blue"]').removeAttribute('selected')
  accentSelect.querySelector('option[value="teal"]').setAttribute('selected', '')
  accentSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
  assert.equal(store.accentPalette, 'teal')
  await flush()
  await flush()
  assert.equal(app.querySelector('.accent-setting select').value, 'teal')
  themeSelect.querySelector('option[value="light"]').removeAttribute('selected')
  themeSelect.querySelector('option[value="dark"]').setAttribute('selected', '')
  themeSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
  assert.equal(store.themeMode, 'dark')

  const tagSelect = app.querySelectorAll('select')[1]
  for (const option of tagSelect.querySelectorAll('option')) option.removeAttribute('selected')
  tagSelect.querySelector('option[value="snapshot"]').setAttribute('selected', '')
  tagSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
  await flush()
  await flush()
  assert.equal(store.arch, 'win64')
  assert.equal(store.tag, 'snapshot')
  const notify = app.querySelector('input[name="notifySnapshotRevisions"]')
  notify.checked = true
  notify.dispatchEvent(new window.Event('change', { bubbles: true }))
  await flush()
  await flush()
  assert.equal(store.snapshotRevisionsSeen['snapshot-test'], '100')
  const versions = structuredClone(store.versions)
  versions.win64.find(build => build.id === 'snapshot-test').revision = '101'
  await chrome.storage.local.set({ versions })
  await flush()
  await flush()
  await flush()
  assert.equal(app.querySelector('.revision-update-label')?.textContent, 'New')
  assert.equal(store.snapshotRevisionsSeen['snapshot-test'], '101')
  // Acknowledgment must not hide the notice in this open popup.
  await flush()
  assert.ok(app.querySelector('.revision-update-label'))

  notify.checked = false
  notify.dispatchEvent(new window.Event('change', { bubbles: true }))
  await flush()
  const newer = structuredClone(store.versions)
  newer.win64.find(build => build.id === 'snapshot-test').revision = '102'
  await chrome.storage.local.set({ versions: newer })
  notify.checked = true
  notify.dispatchEvent(new window.Event('change', { bubbles: true }))
  await flush()
  await flush()
  await flush()
  assert.equal(store.snapshotRevisionsSeen['snapshot-test'], '102')
  assert.equal(app.querySelector('.revision-update-label'), null)

  const track = app.querySelector('input[name="extensionsTrack"]')
  track.checked = true
  track.dispatchEvent(new window.Event('change', { bubbles: true }))
  assert.equal(store.extensionsTrack, true)
  track.checked = false
  track.dispatchEvent(new window.Event('change', { bubbles: true }))
  await flush()
  await flush()
  assert.equal(store.extensionsTrack, false)
})

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
    arch: 'win64',
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
    const { render } = await import('../js/vendor/preact-11.0.1.mjs')
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
  themeSelect.querySelector('option[value="light"]').removeAttribute('selected')
  themeSelect.querySelector('option[value="dark"]').setAttribute('selected', '')
  themeSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
  assert.equal(store.themeMode, 'dark')
})

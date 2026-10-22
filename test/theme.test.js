import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('theme bootstrap applies stored and changed theme modes', async t => {
  const listeners = []
  globalThis.document = { documentElement: { dataset: {} } }
  globalThis.chrome = {
    storage: {
      local: {
        get: (key, callback) => callback({ themeMode: 'dark' })
      },
      onChanged: {
        addListener: listener => listeners.push(listener)
      }
    }
  }
  t.after(() => {
    delete globalThis.chrome
    delete globalThis.document
  })

  await import('../js/theme.js')
  assert.equal(globalThis.document.documentElement.dataset.theme, 'dark')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'blue')

  listeners[0]({ accentPalette: { newValue: 'teal' } }, 'sync')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'blue')
  listeners[0]({ accentPalette: { newValue: 'teal' } }, 'local')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'teal')

  listeners[0]({ themeMode: { newValue: 'light' } }, 'local')
  assert.equal(globalThis.document.documentElement.dataset.theme, 'light')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'teal')

  listeners[0]({ accentPalette: { newValue: 'invalid' } }, 'local')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'blue')
  listeners[0]({ accentPalette: { newValue: 'teal' } }, 'local')
  listeners[0]({ accentPalette: {} }, 'local')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'blue')

  listeners[0]({ themeMode: { newValue: 'invalid' } }, 'local')
  assert.equal(globalThis.document.documentElement.dataset.theme, 'browser')
})

test('theme bootstrap restores a stored accent palette', async t => {
  globalThis.document = { documentElement: { dataset: {} } }
  globalThis.chrome = {
    storage: {
      local: { get: (_keys, callback) => callback({ themeMode: 'light', accentPalette: 'teal' }) },
      onChanged: { addListener () {} }
    }
  }
  t.after(() => {
    delete globalThis.chrome
    delete globalThis.document
  })
  await import('../js/theme.js?stored-accent')
  assert.equal(globalThis.document.documentElement.dataset.accent, 'teal')
  assert.equal(globalThis.document.documentElement.dataset.theme, 'light')
})

test('popup exposes all theme modes and browser-default CSS', async () => {
  const [popup, styles] = await Promise.all([
    readFile(new URL('../js/popup/settings-card.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ])

  assert.match(popup, />Browser default<\/option/)
  assert.match(popup, />Light<\/option/)
  assert.match(popup, />Dark<\/option/)
  assert.match(styles, /prefers-color-scheme: dark/)
  assert.match(styles, /:root\[data-theme=(?:"dark"|dark)\]/)
})

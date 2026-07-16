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
  assert.equal(document.documentElement.dataset.theme, 'dark')

  listeners[0]({ themeMode: { newValue: 'light' } }, 'local')
  assert.equal(document.documentElement.dataset.theme, 'light')

  listeners[0]({ themeMode: { newValue: 'invalid' } }, 'local')
  assert.equal(document.documentElement.dataset.theme, 'browser')
})

test('popup exposes all theme modes and browser-default CSS', async () => {
  const [popup, styles] = await Promise.all([
    readFile(new URL('../js/popup.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ])

  assert.match(popup, />Browser default<\/option/)
  assert.match(popup, />Light<\/option/)
  assert.match(popup, />Dark<\/option/)
  assert.match(styles, /prefers-color-scheme: dark/)
  assert.match(styles, /:root\[data-theme="dark"\]/)
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('popup module resolves all local imports', async () => {
  await assert.rejects(
    import('../js/popup.js'),
    error => {
      assert.equal(error.name, 'ReferenceError')
      assert.match(error.message, /document is not defined/)
      return true
    }
  )
})

test('popup keeps spacing between the Chromium label and version', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /<span>Chromium <\/span>\s*<code>/)
})

test('popup identifies custom colors as badge colors', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /Use custom badge colors/)
})

test('popup guards asynchronous initialization and local storage changes', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /if \(areaName !== 'local'\)/)
  assert.match(source, /if \(this\.mounted\) \{\s*this\.setState\(config\)/)
  assert.match(source, /componentWillUnmount \(\) \{\s*this\.mounted = false/)
})

test('popup provides accessible controls, live status and external links', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(source, /aria-label="\$\{toggleTitle\} \$\{extension\.name\}"/)
  assert.match(source, /aria-label="Open the project on GitHub"/)
  assert.match(source, /aria-live="polite"/)
  assert.equal(
    source.match(/target="_blank"/g)?.length,
    source.match(/rel="noopener noreferrer"/g)?.length
  )
  assert.match(styles, /summary:focus-visible/)
})

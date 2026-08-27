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

test('popup keeps the update check beside the installed Chromium version', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  const summary = source.match(/<summary>\s*<span>Chromium[\s\S]*?<\/summary>/)?.[0]
  assert.match(summary, /Check for Updates/)
  assert.match(summary, /class="check-now"/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.doesNotMatch(source, />Check now</)
  assert.match(styles, /button\.check-now[\s\S]*?float: right;/)
  assert.match(styles, /button\.check-now[\s\S]*?font-size: 0\.85em;/)
})

test('manual update checks open Chromium details when an update is available', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /response\?\.ok &&\s*getChromiumVersionStatus\(/)
  assert.match(source, /chromiumOpenRequest \+ 1/)
  assert.match(source, /key="\$\{chromiumOpenRequest\}"/)
})

test('popup keeps spacing between the revision and its timestamp', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(
    source,
    /\$\{current\.revision\}<\/span\s*>\$\{' '\}\(\$\{new Date/
  )
})

test('popup identifies custom colors as badge colors', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /Use custom badge colors/)
})

test('popup credits the build data project and labels the tracked build', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /<span>Powered by <\/span>/)
  assert.match(source, />Chromium Build Sources<\/a>/)
  assert.match(source, /<span>Tracking <\/span>/)
  assert.match(
    source,
    /https:\/\/github\.com\/Bone06\/chromium-build-sources/
  )
})

test('popup only warns when the selected build source is stale', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /current\?\.source\?\.stale/)
  assert.match(source, /The selected build source could not be refreshed/)
  assert.doesNotMatch(source, /buildFeedSources\.some/)
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

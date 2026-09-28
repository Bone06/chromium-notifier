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

test('popup separates the Chromium title from the installed version', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /<span>Chromium<\/span>/)
  assert.match(source, /class="chromium-status__installed"/)
  assert.match(source, /<span>Installed <\/span>\s*<code[\s\S]*?>/)
  assert.match(source, /chromium-status__installed-version--update/)
})

test('popup visibly identifies the experimental UI build', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(
    source,
    /class="beta-label" title="Experimental UI build">Beta<\/span>/
  )
  assert.match(styles, /\.beta-label\s*\{[\s\S]*?text-transform: uppercase;/)
})

test('popup keeps the update check in the Chromium summary', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  const summary = source.match(
    /<summary class="chromium-status__summary">[\s\S]*?<span>Chromium[\s\S]*?<\/summary>/
  )?.[0]
  assert.match(summary, /aria-label="\$\{checking \? 'Checking for updates' : 'Check for updates'\}"/)
  assert.match(summary, />\$\{checking \? 'Checking…' : 'Check now'\}<\/button>/)
  assert.match(summary, /class="check-now"/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(styles, /\.chromium-status__summary-content\s*\{[\s\S]*?display: inline-flex;/)
  assert.match(styles, /button\.check-now[\s\S]*?margin: 0 0 0 auto;/)
  assert.match(styles, /button\.check-now[\s\S]*?font-size: 0\.7rem;/)
  assert.match(styles, /button\.check-now[\s\S]*?min-width: 0;/)
  assert.match(
    styles,
    /\.chromium-status__installed code\.chromium-status__installed-version--update\s*\{\s*color: var\(--error\);/
  )
})

test('popup keeps check history visible outside the collapsible details', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(
    source,
    /<\/details>\s*<div class="chromium-status__history">/
  )
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
  assert.match(source, /current\.source\?\.stale/)
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

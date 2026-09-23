import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix, relative } from 'node:path'
import test from 'node:test'
import {
  readReleaseFiles,
  stageExtension
} from '../scripts/stage-extension.js'

const projectRoot = new URL('../', import.meta.url)
const readProjectFile = (path, encoding = undefined) =>
  readFile(new URL(path, projectRoot), encoding)

const collectFiles = async (root, directory = root) => {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(root, path))
    else files.push(relative(root, path).replaceAll('\\', '/'))
  }
  return files.sort()
}

const localHtmlReferences = html => [...html.matchAll(
  /\b(?:href|src)="([^"#:]+)"/g
)].map(match => match[1])

const localModuleReferences = source => [...source.matchAll(
  /\b(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g
)].map(match => match[1])

test('release allowlist covers runtime dependencies and nothing else', async t => {
  const releaseFiles = await readReleaseFiles()
  const releaseSet = new Set(releaseFiles)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'chromium-notifier-package-'))
  const output = join(temporaryRoot, 'extension')
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))

  await stageExtension({ output, files: releaseFiles })
  assert.deepEqual(await collectFiles(output), releaseFiles)

  const manifest = JSON.parse(await readProjectFile('manifest.json', 'utf8'))
  const manifestFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons)
  ]
  for (const path of manifestFiles) {
    assert.equal(releaseSet.has(path), true, `Manifest file omitted: ${path}`)
  }

  const popupPath = manifest.action.default_popup
  const popup = await readProjectFile(popupPath, 'utf8')
  for (const reference of localHtmlReferences(popup)) {
    const path = posix.normalize(posix.join(posix.dirname(popupPath), reference))
    assert.equal(releaseSet.has(path), true, `Popup file omitted: ${path}`)
  }

  for (const path of releaseFiles.filter(file => /\.m?js$/.test(file))) {
    const source = await readProjectFile(path, 'utf8')
    for (const reference of localModuleReferences(source)) {
      const dependency = posix.normalize(posix.join(posix.dirname(path), reference))
      assert.equal(
        releaseSet.has(dependency),
        true,
        `Module dependency omitted: ${dependency}`
      )
    }
  }

  for (const forbidden of [
    '.git', '.github', 'AI_CONTEXT.md', 'node_modules', 'package.json',
    'README.md', 'release-files.json', 'scripts', 'test'
  ]) {
    assert.equal(
      releaseFiles.some(path => path === forbidden || path.startsWith(`${forbidden}/`)),
      false,
      `Development path included: ${forbidden}`
    )
  }
})

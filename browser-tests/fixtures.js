import { test as base, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// HTTP rendering fixture, not an extension installation. No real browser
// profile, extension storage, production feed or management actions are used.
export const test = base.extend({
  popupOrigin: [async ({ browserName }, use) => {
    if (browserName !== 'chromium') throw new Error('Chromium fixture required')
    const root = fileURLToPath(new URL('../', import.meta.url))
    const allowed = new Set(JSON.parse(await readFile(resolve(root, 'release-files.json'), 'utf8')))
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, 'http://127.0.0.1').pathname.slice(1)
      if (!allowed.has(path)) { response.writeHead(404).end(); return }
      try {
        const type = path.endsWith('.html') ? 'text/html' : /\.m?js$/.test(path)
          ? 'text/javascript' : path.endsWith('.css') ? 'text/css'
          : path.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
        response.setHeader('Content-Type', `${type}; charset=utf-8`)
        response.end(await readFile(resolve(root, path)))
      } catch { response.writeHead(500).end() }
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try { await use(`http://127.0.0.1:${server.address().port}`) } finally {
      await new Promise(resolve => server.close(resolve))
    }
  }, { scope: 'worker' }],
  page: async ({ page, popupOrigin }, use) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => new URL(route.request().url()).origin === popupOrigin
      ? route.continue() : route.abort())
    await page.addInitScript(() => {
      const extension = {
        id: 'a'.repeat(32), name: 'Long extension name '.repeat(20),
        version: '1.0.0', type: 'extension', enabled: true, installType: 'development'
      }
      const initial = {
        schemaVersion: 1, arch: 'win64', tag: 'snapshot', extensionsTrack: true,
        notifySnapshotRevisions: false, lastAttemptAt: Date.now(), lastSuccessAt: Date.now(),
        versions: { win64: [{
          id: 'snapshot', tag: 'snapshot', displayName: 'Snapshot test build',
          channel: 'snapshot', version: '150.0.0.0', revision: '100',
          timestamp: 1780000000, links: [{ label: 'Archive', url: 'https://example.com/build.zip' }],
          releaseUrl: 'https://example.com/release',
          source: { id: 'snapshot', name: 'The Chromium Authors', stale: false }
        }] }
      }
      const store = JSON.parse(localStorage.getItem('popup-test-store') || 'null') || initial
      const listeners = new Set()
      const event = { addListener () {}, removeListener () {} }
      const set = async values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [
          key, { oldValue: store[key], newValue }
        ]))
        Object.assign(store, values)
        localStorage.setItem('popup-test-store', JSON.stringify(store))
        for (const listener of listeners) listener(changes, 'local')
      }
      globalThis.popupFixture = { store, set }
      globalThis.chrome = {
        management: {
          get: (_id, callback) => callback({ id: 'self', version: '4.1.0' }),
          getAll: callback => callback([extension]),
          onDisabled: event, onEnabled: event, onInstalled: event, onUninstalled: event
        },
        runtime: {
          id: 'self', getPlatformInfo: callback => callback({ arch: 'x86-64', os: 'win' }),
          sendMessage: (message, callback) => {
            if (message.type !== 'check-now') throw new Error('Unexpected fixture message')
            globalThis.popupFixture.completeCheck = async (error = null) => {
              await set({
                lastAttemptAt: Date.now(), lastErrorAt: error ? Date.now() : null,
                woolyssError: error, woolyssDataStale: Boolean(error),
                ...(!error ? { lastSuccessAt: Date.now() } : {})
              })
              callback({ ok: true })
            }
          }
        },
        storage: {
          local: { get: (keys, callback) => typeof keys === 'function' ? keys({ ...store }) : callback({ ...store }), set },
          onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) }
        }
      }
    })
    await page.goto(`${popupOrigin}/popup.html`)
    await expect(page.getByRole('heading', { name: 'Chromium Update Notifications' })).toBeVisible()
    await use(page)
    expect(errors).toEqual([])
  }
})

export { expect }

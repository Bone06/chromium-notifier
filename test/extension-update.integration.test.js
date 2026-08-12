import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import {
  fetchExtensionInfo,
  fetchExtensionsInfo
} from '../js/utils.js'

const fetchLocalExtensionInfo = (updateUrl, ids, prodversion, options = {}) =>
  fetchExtensionInfo(updateUrl, ids, prodversion, {
    ...options,
    allowPrivateNetwork: true
  })

const fetchLocalExtensionsInfo = (extensions, prodversion, options = {}) =>
  fetchExtensionsInfo(extensions, prodversion, {
    ...options,
    allowPrivateNetwork: true
  })

const startServer = async () => {
  const requests = []
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    requests.push(url)

    if (url.pathname === '/redirect') {
      url.pathname = '/updates'
      url.searchParams.set('redirected', 'true')
      response.writeHead(302, { location: `${url.pathname}${url.search}` })
      response.end()
      return
    }

    if (url.pathname === '/error') {
      response.writeHead(500, { 'content-type': 'text/plain' })
      response.end('Server error')
      return
    }

    if (url.pathname === '/invalid') {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<html>Not an update manifest</html>')
      return
    }

    if (url.pathname === '/slow') {
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'application/xml' })
        response.end('<gupdate protocol="2.0"></gupdate>')
      }, 100)
      return
    }

    if (url.pathname === '/oversized') {
      response.writeHead(200, { 'content-type': 'application/xml' })
      response.end(`<gupdate>${'x'.repeat(500)}</gupdate>`)
      return
    }

    const ids = url.searchParams
      .getAll('x')
      .map(value => new URLSearchParams(value).get('id'))

    if (
      url.pathname === '/batch-errors' &&
      ids.some(id => id.includes('-fail-'))
    ) {
      response.writeHead(500, { 'content-type': 'text/plain' })
      response.end('Batch error')
      return
    }

    const apps = ids.map(id =>
      id === 'current-extension'
        ? `<app appid="${id}"><updatecheck status="noupdate" /></app>`
        : `<app appid="${id}"><updatecheck status="ok" version="2.0.0" codebase="http://127.0.0.1/files/${id}.crx" /></app>`
    )

    if (url.pathname === '/unrequested') {
      apps.push(
        '<app appid="not-requested"><updatecheck status="ok" version="9.0.0" codebase="http://127.0.0.1/files/not-requested.crx" /></app>'
      )
    }

    if (url.pathname === '/unsafe-codebase') {
      apps[0] = `<app appid="${ids[0]}"><updatecheck status="ok" version="9.0.0" codebase="javascript:alert(1)" /></app>`
    }

    response.writeHead(200, { 'content-type': 'application/xml' })
    response.end(`<gupdate protocol="2.0">${apps.join('')}</gupdate>`)
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    ),
    requests
  }
}

test('fetchExtensionInfo performs a real HTTP update check for multiple ids', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  const result = await fetchLocalExtensionInfo(
    `${fixture.baseUrl}/updates?channel=stable`,
    ['outdated-extension', 'current-extension'],
    '120.0.0.0'
  )

  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'outdated-extension')
  assert.equal(result[0].version, '2.0.0')
  assert.equal(result[0].status, 'ok')
  assert.equal(result[1].id, 'current-extension')
  assert.equal(result[1].status, 'noupdate')

  const [request] = fixture.requests
  assert.equal(request.searchParams.get('channel'), 'stable')
  assert.equal(request.searchParams.get('acceptformat'), 'crx2,crx3')
  assert.equal(request.searchParams.get('prodversion'), '120.0.0.0')
  assert.deepEqual(request.searchParams.getAll('x'), [
    'id=outdated-extension&uc',
    'id=current-extension&uc'
  ])
})

test('fetchExtensionInfo blocks loopback update servers by default', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  await assert.rejects(
    fetchExtensionInfo(
      `${fixture.baseUrl}/updates`,
      ['extension'],
      '120.0.0.0'
    ),
    /Invalid extension update URL/
  )
  assert.equal(fixture.requests.length, 0)
})

test('fetchExtensionInfo rejects redirects by default', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  await assert.rejects(
    fetchLocalExtensionInfo(
      `${fixture.baseUrl}/redirect`,
      ['redirected-extension'],
      '120.0.0.0'
    ),
    /fetch|redirect/i
  )
  assert.equal(fixture.requests.length, 1)
})

test('fetchExtensionInfo rejects HTTP and invalid XML responses', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  await assert.rejects(
    fetchLocalExtensionInfo(`${fixture.baseUrl}/error`, ['one'], '120.0.0.0'),
    /failed \(500\)/
  )
  await assert.rejects(
    fetchLocalExtensionInfo(`${fixture.baseUrl}/invalid`, ['one'], '120.0.0.0'),
    /Invalid extension update manifest/
  )
})

test('fetchExtensionInfo rejects timeouts and oversized responses', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  await assert.rejects(
    fetchLocalExtensionInfo(
      `${fixture.baseUrl}/slow`,
      ['one'],
      '120.0.0.0',
      { timeoutMs: 20 }
    ),
    /timed out/
  )
  await assert.rejects(
    fetchLocalExtensionInfo(
      `${fixture.baseUrl}/oversized`,
      ['one'],
      '120.0.0.0',
      { maxResponseBytes: 100 }
    ),
    /exceeds 100 bytes/
  )
})

test('fetchExtensionInfo ignores unrequested ids and rejects unsafe codebases', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  const result = await fetchLocalExtensionInfo(
    `${fixture.baseUrl}/unrequested`,
    ['requested'],
    '120.0.0.0'
  )
  assert.deepEqual(result.map(({ id }) => id), ['requested'])

  await assert.rejects(
    fetchLocalExtensionInfo(
      `${fixture.baseUrl}/unsafe-codebase`,
      ['requested'],
      '120.0.0.0'
    ),
    /Invalid extension update codebase URL/
  )
})

test('fetchExtensionsInfo keeps successful servers when another server fails', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  const result = await fetchLocalExtensionsInfo(
    [
      { id: 'working-extension', updateUrl: `${fixture.baseUrl}/updates` },
      { id: 'broken-extension', updateUrl: `${fixture.baseUrl}/error` },
      { id: 'unpacked-extension' }
    ],
    '120.0.0.0'
  )

  assert.deepEqual(result.extensionsInfo.map(({ id }) => id), [
    'working-extension'
  ])
  assert.deepEqual(result.extensionsErrors, [
    {
      batch: 1,
      totalBatches: 1,
      updateUrl: `${fixture.baseUrl}/error`,
      message: 'Extension update request failed (500)'
    }
  ])
  assert.deepEqual(result.extensionsUpdateSummary, {
    batches: 2,
    failed: 1,
    failedBatches: 1,
    succeeded: 1,
    total: 2
  })
})

test('fetchExtensionsInfo splits long update requests into batches', async t => {
  const fixture = await startServer()
  t.after(fixture.close)
  const ids = Array.from({ length: 80 }, (_, index) =>
    `extension-${index.toString().padStart(2, '0')}-${'x'.repeat(20)}`
  )

  const result = await fetchLocalExtensionsInfo(
    ids.map(id => ({ id, updateUrl: `${fixture.baseUrl}/updates` })),
    '120.0.0.0',
    { maxUrlLength: 500 }
  )

  const updateRequests = fixture.requests.filter(
    ({ pathname }) => pathname === '/updates'
  )
  assert.ok(updateRequests.length > 1)
  assert.equal(result.extensionsInfo.length, ids.length)
  assert.deepEqual(result.extensionsInfo.map(({ id }) => id), ids)
  assert.deepEqual(result.extensionsErrors, [])
  assert.deepEqual(result.extensionsUpdateSummary, {
    batches: updateRequests.length,
    failed: 0,
    failedBatches: 0,
    succeeded: 1,
    total: 1
  })
  updateRequests.forEach(url => assert.ok(url.href.length <= 500))
})

test('fetchExtensionsInfo preserves successful batches from a partially failing server', async t => {
  const fixture = await startServer()
  t.after(fixture.close)
  const ids = [
    `extension-first-${'x'.repeat(30)}`,
    `extension-second-${'x'.repeat(30)}`,
    `extension-fail-${'x'.repeat(30)}`,
    `extension-fourth-${'x'.repeat(30)}`,
    `extension-fifth-${'x'.repeat(30)}`
  ]

  const result = await fetchLocalExtensionsInfo(
    ids.map(id => ({ id, updateUrl: `${fixture.baseUrl}/batch-errors` })),
    '120.0.0.0',
    { maxUrlLength: 190 }
  )

  assert.ok(result.extensionsInfo.length > 0)
  assert.ok(result.extensionsInfo.length < ids.length)
  assert.equal(result.extensionsErrors.length, 1)
  assert.equal(result.extensionsErrors[0].updateUrl, `${fixture.baseUrl}/batch-errors`)
  assert.ok(result.extensionsErrors[0].totalBatches > 1)
  assert.deepEqual(result.extensionsUpdateSummary, {
    batches: result.extensionsErrors[0].totalBatches,
    failed: 1,
    failedBatches: 1,
    succeeded: 0,
    total: 1
  })
})

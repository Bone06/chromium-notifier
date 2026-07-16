import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import {
  fetchExtensionInfo,
  fetchExtensionsInfo
} from '../js/utils.js'

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

    const ids = url.searchParams
      .getAll('x')
      .map(value => new URLSearchParams(value).get('id'))

    const apps = ids.map(id =>
      id === 'current-extension'
        ? `<app appid="${id}"><updatecheck status="noupdate" /></app>`
        : `<app appid="${id}"><updatecheck status="ok" version="2.0.0" codebase="http://127.0.0.1/files/${id}.crx" /></app>`
    )

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

  const result = await fetchExtensionInfo(
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

test('fetchExtensionInfo follows redirects', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  const [result] = await fetchExtensionInfo(
    `${fixture.baseUrl}/redirect`,
    ['redirected-extension'],
    '120.0.0.0'
  )

  assert.equal(result.id, 'redirected-extension')
  assert.equal(result.version, '2.0.0')
  assert.equal(fixture.requests.length, 2)
  assert.equal(fixture.requests[1].searchParams.get('redirected'), 'true')
})

test('fetchExtensionInfo rejects HTTP and invalid XML responses', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  await assert.rejects(
    fetchExtensionInfo(`${fixture.baseUrl}/error`, ['one'], '120.0.0.0'),
    /failed \(500\)/
  )
  await assert.rejects(
    fetchExtensionInfo(`${fixture.baseUrl}/invalid`, ['one'], '120.0.0.0'),
    /Invalid extension update manifest/
  )
})

test('fetchExtensionsInfo keeps successful servers when another server fails', async t => {
  const fixture = await startServer()
  t.after(fixture.close)

  const result = await fetchExtensionsInfo(
    [
      { id: 'working-extension', updateUrl: `${fixture.baseUrl}/updates` },
      { id: 'broken-extension', updateUrl: `${fixture.baseUrl}/error` },
      { id: 'unpacked-extension' }
    ],
    '120.0.0.0'
  )

  assert.deepEqual(result.map(({ id }) => id), ['working-extension'])
})

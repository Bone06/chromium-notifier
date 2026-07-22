export const FEED_SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256'

export const TRUSTED_FEED_KEYS = Object.freeze({
  'feed-2026-01': Object.freeze({
    crv: 'P-256',
    kty: 'EC',
    x: 'uHzo7ldW70BMSIj5eeKBquctE_LawKdPLyxyOZUKUN8',
    y: 'UyBtCc-LLYfxaTxCHftjSuxnQhqlGi-4E8Ygeu0nsj4'
  })
})

const parseSignature = text => {
  let document
  try { document = JSON.parse(text) } catch { throw new Error('Invalid feed signature JSON') }
  if (
    !document || typeof document !== 'object' || Array.isArray(document) ||
    Object.keys(document).sort().join(',') !==
      'algorithm,keyId,schemaVersion,signature' ||
    document.schemaVersion !== 1 ||
    document.algorithm !== FEED_SIGNATURE_ALGORITHM ||
    !/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(document.keyId || '') ||
    !/^[A-Za-z0-9_-]{86}$/.test(document.signature || '')
  ) throw new Error('Invalid feed signature document')
  return document
}

const decodeBase64Url = value => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export const verifySignedBuildFeed = async (
  feedText,
  signatureText,
  trustedKeys = TRUSTED_FEED_KEYS
) => {
  const document = parseSignature(signatureText)
  const jwk = trustedKeys[document.keyId]
  if (!jwk) throw new Error(`Untrusted feed signing key: ${document.keyId}`)
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  )
  const valid = await crypto.subtle.verify(
    { hash: 'SHA-256', name: 'ECDSA' },
    key,
    decodeBase64Url(document.signature),
    new TextEncoder().encode(feedText)
  )
  if (!valid) throw new Error('Feed signature verification failed')
  return true
}

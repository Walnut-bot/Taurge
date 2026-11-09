// Durée de session alignée sur le backend (JWT `exp`, défaut 12 h) :
// un token périmé doit être considéré expiré côté client pour être
// purgé au lieu d'être envoyé indéfiniment. Lancer : npm test
import assert from 'node:assert/strict'
import test from 'node:test'

import { tokenExpiryMs, isTokenExpired } from './token-expiry.ts'

function fakeJwt(expSeconds) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: expSeconds })}.signature`
}

test('exp lu depuis le JWT, en millisecondes', () => {
  assert.equal(tokenExpiryMs(fakeJwt(2_000_000_000)), 2_000_000_000_000)
})

test('token périmé détecté, token valide conservé', () => {
  const now = 1_700_000_000_000
  assert.equal(isTokenExpired(fakeJwt(1_600_000_000), now), true)
  assert.equal(isTokenExpired(fakeJwt(1_800_000_000), now), false)
})

test('token illisible ou sans exp: jamais déclaré expiré', () => {
  assert.equal(tokenExpiryMs('pas-un-jwt'), null)
  assert.equal(isTokenExpired('pas-un-jwt'), false)
  assert.equal(isTokenExpired('aaa.bbb.ccc'), false)
})

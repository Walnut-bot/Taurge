// Régression : un échec réseau (API locale en démarrage à
// froid) doit déclencher réveil /health + nouvel essai, pas un
// abandon immédiat « Cannot reach the Taurge server ».
// Lancer : npm test (depuis apps/web)
import assert from 'node:assert/strict'
import test from 'node:test'

import { attemptsForMethod, resilientFetch } from './resilient-fetch.ts'

const noSleep = async () => {}
const ok = (body = '{}') => new Response(body, { status: 200 })

test('echec reseau puis reveil: le deuxieme essai passe', async () => {
  const calls = []
  const fetchFn = async (url) => {
    calls.push(url)
    if (url.endsWith('/health')) return ok()
    if (calls.filter((u) => u.endsWith('/projects/1')).length === 1) {
      throw new TypeError('Failed to fetch')
    }
    return ok()
  }
  const res = await resilientFetch('https://api.test/projects/1', { method: 'DELETE' }, {
    apiUrl: 'https://api.test', attempts: 3, fetchFn, sleep: noSleep,
  })
  assert.equal(res.status, 200)
  assert.ok(calls.includes('https://api.test/health'))
})

test('reponse HTTP 500: jamais reessayee', async () => {
  let count = 0
  const fetchFn = async () => {
    count++
    return new Response('{}', { status: 500 })
  }
  const res = await resilientFetch('https://api.test/projects', { method: 'GET' }, {
    apiUrl: 'https://api.test', attempts: 3, fetchFn, sleep: noSleep,
  })
  assert.equal(res.status, 500)
  assert.equal(count, 1)
})

test('serveur jamais reveille: erreur apres le nombre d essais prevu', async () => {
  const fetchFn = async () => {
    throw new TypeError('Failed to fetch')
  }
  await assert.rejects(
    resilientFetch('https://api.test/projects/1', { method: 'DELETE' }, {
      apiUrl: 'https://api.test', attempts: 3, fetchFn, sleep: noSleep, wakeTimeoutMs: 0,
    }),
    /Failed to fetch/,
  )
})

test('politique de tentatives: GET/DELETE 3, ecritures 2', () => {
  assert.equal(attemptsForMethod('GET'), 3)
  assert.equal(attemptsForMethod('DELETE'), 3)
  assert.equal(attemptsForMethod('POST'), 2)
  assert.equal(attemptsForMethod('PATCH'), 2)
  assert.equal(attemptsForMethod(undefined), 3)
})

// Architecture : frontend Vercel + API locale sur le PC.
// Sans configuration, le site doit appeler localhost:8000 — jamais
// un ancien hébergeur distant. L'URL de tunnel (?api=…) mémorisée
// dans le navigateur a priorité sur tout.
// Lancer : npm test (depuis apps/web)
import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveApiUrl } from './api-url.ts'

test('sans configuration: localhost, le backend du PC', () => {
  assert.equal(resolveApiUrl(undefined, null), 'http://localhost:8000')
  assert.equal(resolveApiUrl('', ''), 'http://localhost:8000')
})

test('override tunnel du navigateur: prioritaire, sans slash final', () => {
  assert.equal(
    resolveApiUrl('http://localhost:8000', 'https://abc.trycloudflare.com/'),
    'https://abc.trycloudflare.com',
  )
  assert.equal(resolveApiUrl(undefined, 'https://abc.trycloudflare.com'), 'https://abc.trycloudflare.com')
})

test('variable de build: utilisee sans override', () => {
  assert.equal(resolveApiUrl('https://api.example.com/', null), 'https://api.example.com')
})

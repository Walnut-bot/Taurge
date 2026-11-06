// Régression : le site déployé (Vercel) ne doit jamais appeler
// http://localhost:8000 quand NEXT_PUBLIC_API_URL est absente.
// Lancer : node --test lib/api-url.test.mjs  (depuis apps/web)
import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveApiUrl } from './api-url.ts'

test('production sans variable: cible l API Render, pas localhost', () => {
  assert.equal(resolveApiUrl(undefined, 'taurge.vercel.app'), 'https://taurge-api.onrender.com')
  assert.equal(resolveApiUrl('', 'taurge.vercel.app'), 'https://taurge-api.onrender.com')
})

test('developpement local: garde localhost', () => {
  assert.equal(resolveApiUrl(undefined, 'localhost'), 'http://localhost:8000')
  assert.equal(resolveApiUrl(undefined, '127.0.0.1'), 'http://localhost:8000')
  assert.equal(resolveApiUrl(undefined, null), 'http://localhost:8000')
})

test('variable explicite: prioritaire et sans slash final', () => {
  assert.equal(resolveApiUrl('https://api.example.com/', 'taurge.vercel.app'), 'https://api.example.com')
  assert.equal(resolveApiUrl(' http://localhost:8000/ ', 'localhost'), 'http://localhost:8000')
})

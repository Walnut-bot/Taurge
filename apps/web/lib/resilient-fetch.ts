// Fetch résilient quand l'API locale démarre ou que le tunnel se reconnecte.
//
// Symptôme corrigé : première requête après une période d'inactivité
// (ou pendant un redéploiement) -> « Failed to fetch », affiché comme
// « Cannot reach the Taurge server » alors que le serveur met juste
// 30-90 s à se réveiller. On réessaie après un ping /health qui
// attend le réveil, au lieu d'abandonner au premier échec réseau.
//
// Les réponses HTTP (même 4xx/5xx) ne sont jamais réessayées ici :
// seul un échec réseau/timeout — aucune réponse reçue — déclenche
// un nouvel essai.
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface ResilientFetchOptions {
  fetchFn?: FetchFn
  /** URL de base de l'API, pour le ping de réveil `/health`. */
  apiUrl: string
  /** Nombre total de tentatives (1 = aucun retry). */
  attempts?: number
  /** Délai max par tentative, en ms. */
  timeoutMs?: number
  /** Attente du réveil du serveur, en ms. */
  wakeTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function withTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (init.signal || !timeoutMs) return fetchFn(url, init)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchFn(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Attend que l'API réponde sur /health (réveil de l'API locale). Best effort. */
export async function wakeServer(
  fetchFn: FetchFn,
  apiUrl: string,
  wakeTimeoutMs = 90_000,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<boolean> {
  const deadline = Date.now() + wakeTimeoutMs
  for (;;) {
    try {
      const res = await withTimeout(fetchFn, `${apiUrl}/health`, { method: 'GET' }, 15_000)
      if (res.ok) return true
    } catch {
      // Serveur encore en train de démarrer : on retente.
    }
    if (Date.now() >= deadline) return false
    await sleep(3_000)
  }
}

export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions,
): Promise<Response> {
  const fetchFn = options.fetchFn ?? ((u, i) => fetch(u, i))
  const sleep = options.sleep ?? defaultSleep
  const attempts = Math.max(1, options.attempts ?? 2)
  const timeoutMs = options.timeoutMs ?? 30_000
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fetchFn, url, init, timeoutMs)
    } catch (err) {
      lastError = err
      if (attempt === attempts) break
      // Aucune réponse reçue : le serveur dort peut-être. On attend
      // son réveil avant de réessayer, plutôt que de réessayer en
      // aveugle pendant qu'il démarre.
      await wakeServer(fetchFn, options.apiUrl, options.wakeTimeoutMs ?? 90_000, sleep)
    }
  }
  throw lastError
}

/** GET/DELETE sont idempotents : 3 essais. Les écritures : 2 essais,
 * et seulement après confirmation du réveil par /health. */
export function attemptsForMethod(method?: string): number {
  const m = (method ?? 'GET').toUpperCase()
  return m === 'GET' || m === 'DELETE' || m === 'HEAD' ? 3 : 2
}

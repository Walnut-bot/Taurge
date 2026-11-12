// Résolution de l'URL de l'API FastAPI.
//
// Architecture actuelle : le frontend est déployé sur Vercel, mais
// l'API tourne EN LOCAL sur le PC de l'utilisateur (plus aucun
// hébergeur backend). Deux façons de la joindre depuis le navigateur :
// 1. même machine : http://localhost:8000 (défaut) ;
// 2. via un tunnel HTTPS (Cloudflare, voir LANCER_TAURGE_TUNNEL.bat) :
//    ouvrir le site avec ?api=https://<tunnel> — l'URL est mémorisée
//    dans le navigateur (localStorage) pour les visites suivantes,
//    ?api=local l'efface et revient à localhost.
//
// Priorité : override du navigateur > NEXT_PUBLIC_API_URL (build
// Vercel, si un jour un backend distant revient) > localhost.
export const LOCAL_API_URL = 'http://localhost:8000'
export const API_URL_STORAGE_KEY = 'taurge_api_url'

export function resolveApiUrl(
  configured?: string | null,
  runtimeOverride?: string | null,
): string {
  const override = (runtimeOverride ?? '').trim().replace(/\/+$/, '')
  if (override) return override
  const fromEnv = (configured ?? '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  return LOCAL_API_URL
}

/** Override mémorisé dans ce navigateur (posé par ?api=…). */
export function readRuntimeApiOverride(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const param = new URLSearchParams(window.location.search).get('api')
    if (param === 'local') {
      window.localStorage.removeItem(API_URL_STORAGE_KEY)
      return null
    }
    if (param) {
      const cleaned = param.trim().replace(/\/+$/, '')
      if (/^https?:\/\//i.test(cleaned)) {
        window.localStorage.setItem(API_URL_STORAGE_KEY, cleaned)
        return cleaned
      }
    }
    return window.localStorage.getItem(API_URL_STORAGE_KEY)
  } catch {
    return null
  }
}

// Capture et mémorise immédiatement l'override d'URL dès le chargement du script dans le navigateur
if (typeof window !== 'undefined') {
  readRuntimeApiOverride()
}


// Résolution de l'URL de l'API FastAPI.
//
// Architecture actuelle : le frontend est déployé sur Vercel, mais
// l'API tourne EN LOCAL sur le PC de l'utilisateur (plus aucun
// hébergeur backend). Deux façons de la joindre depuis le navigateur :
// 1. même machine : http://localhost:8000 (défaut) ;
// 2. via un tunnel HTTPS fixe (Ngrok, voir LANCER_TAURGE_EN_LIGNE_NGROK.bat) :
//    ouvrir le site avec ?api=https://<tunnel> — l'URL est mémorisée
//    dans le navigateur (localStorage) pour les visites suivantes,
//    ?api=local l'efface et revient à localhost.
//
// Priorité : override du navigateur > NEXT_PUBLIC_API_URL (build
// Vercel, si un jour un backend distant revient) > localhost.
export const LOCAL_API_URL = 'http://localhost:8000'
export const LOCAL_IPV4_API_URL = 'http://127.0.0.1:8000'
export const DEFAULT_PRODUCTION_API_URL = 'https://taurge-api.onrender.com'
export const API_URL_STORAGE_KEY = 'taurge_api_url'

function isLocalOrEphemeralTunnelUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|trycloudflare\.com|ngrok-free\.(app|dev)/i.test(url)
}

function isRemoteProductionBackend(url: string): boolean {
  return Boolean(url) && /^https?:\/\//i.test(url) && !isLocalOrEphemeralTunnelUrl(url)
}

function isBrowserOnPublicHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location?.hostname || ''
  return Boolean(host) && host !== 'localhost' && host !== '127.0.0.1'
}

export function resolveApiUrl(
  configured?: string | null,
  runtimeOverride?: string | null,
): string {
  const fromEnv = (configured ?? '').trim().replace(/\/+$/, '')
  const override = (runtimeOverride ?? '').trim().replace(/\/+$/, '')

  // En production cloud (ex: Render configuré via NEXT_PUBLIC_API_URL),
  // un ancien override local (127.0.0.1 / localhost) ou tunnel éphémère
  // (trycloudflare / ngrok) resté dans localStorage ne doit JAMAIS écraser
  // l'URL de production ni provoquer d'appel vers 127.0.0.1:8000 chez un testeur.
  if (isRemoteProductionBackend(fromEnv)) {
    if (override && !isLocalOrEphemeralTunnelUrl(override)) {
      return override
    }
    return fromEnv
  }

  if (override) {
    if (isBrowserOnPublicHost() && isLocalOrEphemeralTunnelUrl(override)) {
      return fromEnv || DEFAULT_PRODUCTION_API_URL
    }
    return override
  }
  if (fromEnv) return fromEnv
  if (isBrowserOnPublicHost()) return DEFAULT_PRODUCTION_API_URL
  return LOCAL_API_URL
}

/** Efface un override de tunnel obsolète et bascule sur l'API locale directe. */
export function clearRuntimeApiOverride(fallbackUrl?: string): void {
  if (typeof window === 'undefined') return
  try {
    if (fallbackUrl && !isBrowserOnPublicHost()) {
      window.localStorage.setItem(API_URL_STORAGE_KEY, fallbackUrl)
    } else {
      window.localStorage.removeItem(API_URL_STORAGE_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

/** Override mémorisé dans ce navigateur (posé par ?api=…). */
export function readRuntimeApiOverride(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const configured = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '')
    const publicHost = isBrowserOnPublicHost()
    const prodBackend = isRemoteProductionBackend(configured) || publicHost

    const param = new URLSearchParams(window.location.search).get('api')
    if (param === 'local' || param === 'reset' || param === 'cloud') {
      window.localStorage.removeItem(API_URL_STORAGE_KEY)
      return null
    }
    if (param) {
      const cleaned = param.trim().replace(/\/+$/, '')
      if (/^https?:\/\//i.test(cleaned)) {
        if (prodBackend && isLocalOrEphemeralTunnelUrl(cleaned)) {
          window.localStorage.removeItem(API_URL_STORAGE_KEY)
          return null
        }
        window.localStorage.setItem(API_URL_STORAGE_KEY, cleaned)
        return cleaned
      }
    }
    const stored = window.localStorage.getItem(API_URL_STORAGE_KEY)
    if (stored && prodBackend && isLocalOrEphemeralTunnelUrl(stored)) {
      // Purge automatique des anciens overrides locaux / tunnels chez les testeurs
      window.localStorage.removeItem(API_URL_STORAGE_KEY)
      return null
    }
    return stored
  } catch {
    return null
  }
}

// Capture et mémorise immédiatement l'override d'URL dès le chargement du script dans le navigateur
if (typeof window !== 'undefined') {
  readRuntimeApiOverride()
}


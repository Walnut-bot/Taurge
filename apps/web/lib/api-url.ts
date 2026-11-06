// Résolution de l'URL de l'API FastAPI.
//
// Piège corrigé : sur Vercel (taurge.vercel.app), NEXT_PUBLIC_API_URL
// n'était pas définie, donc le code retombait sur http://localhost:8000.
// Le navigateur de chaque visiteur cherchait alors un serveur sur SA
// propre machine et l'inscription échouait avec « Cannot reach the
// Taurge server ». En production on cible l'API Render ; localhost
// n'est utilisé qu'en développement local.
export const PRODUCTION_API_URL = 'https://taurge-api.onrender.com'
export const LOCAL_API_URL = 'http://localhost:8000'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', ''])

export function resolveApiUrl(
  configured?: string | null,
  hostname?: string | null,
): string {
  const fromEnv = (configured ?? '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  if (hostname != null && !LOCAL_HOSTNAMES.has(hostname.trim().toLowerCase())) {
    return PRODUCTION_API_URL
  }
  return LOCAL_API_URL
}

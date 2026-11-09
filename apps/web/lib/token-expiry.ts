/**
 * Expiration du JWT d'accès, alignée sur le backend
 * (`ACCESS_TOKEN_EXPIRE_MINUTES`, défaut 12 h côté API).
 * Lecture seule du claim `exp` — aucune vérification de signature
 * (faite par le backend à chaque requête), juste la purge locale
 * d'un token périmé pour ne plus l'envoyer ni le conserver.
 */
export function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const expiry = tokenExpiryMs(token)
  return expiry !== null && nowMs >= expiry
}

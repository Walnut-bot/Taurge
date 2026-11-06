import { NextResponse, type NextRequest } from 'next/server'
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from './i18n/config'
import { countryFromHeaders, detectLocale } from './i18n/detect'

/**
 * Proxy i18n — détection automatique de la langue (Étape 1).
 * (Convention `proxy` de Next 16, anciennement `middleware`.)
 *
 * Priorité de détection (voir `i18n/detect.ts`) :
 *   1. Cookie `NEXT_LOCALE` (choix manuel — jamais écrasé, Étape 3)
 *   2. Géolocalisation IP : `x-vercel-ip-country` (Vercel) ou
 *      `cf-ipcountry` (Cloudflare) — pays francophone → `fr`, sinon `en`
 *   3. En-tête `Accept-Language` du navigateur
 *   4. Fallback : `fr`
 *
 * Toute URL sans préfixe de locale est redirigée vers `/<locale>/…`.
 * Toute URL déjà préfixée est servie telle quelle ; le cookie est
 * resynchronisé sur la locale de l'URL (c'est elle qui fait foi après
 * un passage par le LanguageSwitcher).
 */

function withLocaleCookie(response: NextResponse, locale: Locale): NextResponse {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })
  return response
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Déjà préfixé par une locale supportée (/fr/…, /en/…) : on sert la page
  // et on aligne le cookie sur l'URL, sans jamais rediriger en boucle.
  const firstSegment = pathname.split('/')[1]
  if (isLocale(firstSegment)) {
    const response = NextResponse.next()
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      withLocaleCookie(response, firstSegment)
    }
    return response
  }

  // Pas de préfixe : détection automatique puis redirection.
  const locale = detectLocale({
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    country: countryFromHeaders((name) => request.headers.get(name)),
    acceptLanguage: request.headers.get('accept-language'),
  })

  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
  return withLocaleCookie(NextResponse.redirect(url), locale)
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     * - les routes API et les internes Next.js (_next, _vercel)
     * - les fichiers statiques (avec extension : .png, .svg, .ico…)
     */
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
}

import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { AnalyticsGate } from '@/components/analytics-gate'
import { CookieBanner } from '@/components/cookie-banner'
import { DemoBanner } from '@/components/demo-banner'
import { SiteFooter } from '@/components/site-footer'
import { locales } from '@/i18n/config'
import { IntlProvider } from '@/i18n/provider'
import { getMessages, parseLocale } from '@/i18n/server'
import { themeScript } from '@/lib/theme'
import '../globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Taurge — Manga, manhwa and webtoon localization studio',
    template: '%s · Taurge',
  },
  description:
    'AI localization and lettering studio for manga, manhwa and webtoons.',
  icons: {
    icon: '/icon.svg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1a17' },
  ],
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const locale = parseLocale((await params).locale)
  if (!locale) notFound()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Anti-flash script: applies the theme BEFORE the first render */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans antialiased bg-paper text-ink">
        <IntlProvider locale={locale} messages={getMessages(locale)}>
          <DemoBanner />
          {children}
          <SiteFooter />
          <CookieBanner />
        </IntlProvider>
        <AnalyticsGate />
      </body>
    </html>
  )
}

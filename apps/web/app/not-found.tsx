import Link from 'next/link'

/**
 * 404 racine : affichée pour les URL hors `/[locale]` (ex : locale inconnue).
 * Hors du layout localisé, elle porte donc son propre <html> et utilise
 * la langue par défaut (fr).
 */
export default function RootNotFound() {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-paper text-ink">
        <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <p className="font-mono text-sm uppercase tracking-wider">Erreur 404</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Page introuvable</h1>
            <p className="text-sm text-ink-soft sm:text-base">
              Le projet ou la ressource que vous recherchez n&apos;existe pas ou a été déplacé.
            </p>
            <div className="pt-4">
              <Link href="/fr/dashboard" className="font-medium underline underline-offset-4">
                Retour aux projets
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}

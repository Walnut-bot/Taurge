// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
import { AppHeader } from '@/components/app-header'
import { getLegalDoc, type LegalDocKey } from '@/lib/legal-docs'

export function LegalDoc({ locale, docKey }: { locale: string; docKey: LegalDocKey }) {
  const doc = getLegalDoc(locale, docKey)
  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{doc.updated}</p>
        {doc.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-3 leading-relaxed text-ink-soft">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
    </>
  )
}

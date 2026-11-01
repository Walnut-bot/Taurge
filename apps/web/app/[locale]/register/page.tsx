import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth-form'
import { getTranslations, parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale ? getTranslations(locale, 'Nav')('register') : undefined }
}

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  )
}

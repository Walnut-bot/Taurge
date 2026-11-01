/**
 * Mini-moteur de traduction compatible avec l'usage next-intl :
 * `t('title')`, `t('confirmDelete', { name })`, `t.raw('steps')`.
 * Les messages sont de simples objets JSON imbriqués par namespace.
 */

export type Messages = Record<string, unknown>

function lookup(messages: Messages, path: string): unknown {
  let current: unknown = messages
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

export interface Translator {
  (key: string, values?: Record<string, string | number>): string
  raw: <T = unknown>(key: string) => T
}

export function createTranslator(messages: Messages, namespace?: string): Translator {
  const resolve = (key: string) =>
    lookup(messages, namespace ? `${namespace}.${key}` : key)

  const translator = ((key: string, values?: Record<string, string | number>) => {
    const value = resolve(key)
    if (typeof value !== 'string') {
      // Clé absente : on renvoie la clé pour la rendre visible en dev,
      // plutôt que de planter l'interface.
      return namespace ? `${namespace}.${key}` : key
    }
    return interpolate(value, values)
  }) as Translator

  translator.raw = <T = unknown>(key: string): T => resolve(key) as T
  return translator
}

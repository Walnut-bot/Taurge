/**
 * Catalogue centralisé des polices et styles typographiques pour Taurge.
 *
 * Supporte les styles officiels de scanlation :
 * - Cinzel : Récitatifs, boîtes noires / narrations, monologues solennels (police du carré noir).
 * - Comic Neue : Dialogues standards de manga/manhwa.
 * - Bangers : Cris, combats, répliques d'action percutantes.
 * - Cormorant : Monologues intérieurs, poésie, pensées intimes.
 * - Permanent Marker : Onomatopées, bruitages (SFX), inscriptions manuelles.
 * - Inter : Textes contemporains, téléphones portables, interfaces.
 */

export interface FontOption {
  id: string
  name: string
  shortLabel: string
  category: string
  className: string
  fontFamily: string
  description: string
  defaultTransform?: 'uppercase' | 'none'
  previewSample: string
}

function detectLocale(explicit?: string): 'fr' | 'en' {
  if (explicit === 'en' || explicit === 'fr') return explicit
  if (typeof window !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('NEXT_LOCALE='))
      ?.split('=')[1]
    if (cookie === 'en' || cookie === 'fr') return cookie
    const segment = window.location.pathname.split('/')[1]
    if (segment === 'en') return 'en'
  }
  return 'fr'
}

export const FONTS_LIST_FR: FontOption[] = [
  {
    id: 'cinzel',
    name: 'Cinzel (Carré noir / Récitatif)',
    shortLabel: 'Cinzel',
    category: 'Roman / Serif',
    className: 'font-manhwa-system',
    fontFamily: "var(--font-cinzel), 'Cinzel', serif",
    description: 'Police en capitales solennelles pour les encadrés noirs, la narration et les voix de système.',
    defaultTransform: 'uppercase',
    previewSample: 'JE NE PEUX PAS CROIRE QUE...',
  },
  {
    id: 'comic-neue',
    name: 'Comic Neue (Dialogue standard)',
    shortLabel: 'Comic Neue',
    category: 'Manga / Manhwa',
    className: 'font-manhwa-dialogue',
    fontFamily: "var(--font-comic), 'Comic Neue', sans-serif",
    description: 'Police standard de bande dessinée, optimisée pour une lecture fluide des dialogues.',
    defaultTransform: 'uppercase',
    previewSample: 'Bonjour ! Comment vas-tu ?',
  },
  {
    id: 'bangers',
    name: 'Bangers (Cris / Combats)',
    shortLabel: 'Bangers',
    category: 'Action / Shonen',
    className: 'font-manhwa-scream',
    fontFamily: "var(--font-bangers), 'Bangers', cursive, sans-serif",
    description: 'Typographie percutante et condensée pour les attaques, cris et répliques sous tension.',
    defaultTransform: 'uppercase',
    previewSample: 'ATTENTION DERRIÈRE TOI !',
  },
  {
    id: 'cormorant',
    name: 'Cormorant (Pensées / Narrateur)',
    shortLabel: 'Cormorant',
    category: 'Élégant / Serif',
    className: 'font-manhwa-thought',
    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Garamond, serif",
    description: 'Empattements raffinés pour monologues poétiques, pensées murmurées et flash-backs.',
    defaultTransform: 'none',
    previewSample: 'Ce jour-là, tout a changé...',
  },
  {
    id: 'permanent-marker',
    name: 'Permanent Marker (SFX / Effets)',
    shortLabel: 'Marker',
    category: 'SFX / Bruitages',
    className: 'font-manhwa-sfx',
    fontFamily: "var(--font-marker), 'Permanent Marker', cursive, sans-serif",
    description: 'Effet feutre dynamique pour onomatopées manuscrites et bruitages dessinés.',
    defaultTransform: 'uppercase',
    previewSample: 'BOOM ! CRASH !',
  },
  {
    id: 'sans',
    name: 'Inter (Moderne / Interface)',
    shortLabel: 'Inter',
    category: 'Sans-Serif',
    className: 'font-sans font-bold',
    fontFamily: "var(--font-sans), 'Inter', sans-serif",
    description: 'Police moderne et nette pour SMS, notifications système et textes techniques.',
    defaultTransform: 'none',
    previewSample: 'Nouveau message reçu.',
  },
]

export const FONTS_LIST_EN: FontOption[] = [
  {
    id: 'cinzel',
    name: 'Cinzel (Black Box / Narration)',
    shortLabel: 'Cinzel',
    category: 'Serif / Narration',
    className: 'font-manhwa-system',
    fontFamily: "var(--font-cinzel), 'Cinzel', serif",
    description: 'Solemn all-caps typeface for black narration boxes, monologues, and system prompts.',
    defaultTransform: 'uppercase',
    previewSample: 'I CANNOT BELIEVE THAT...',
  },
  {
    id: 'comic-neue',
    name: 'Comic Neue (Standard Dialogue)',
    shortLabel: 'Comic Neue',
    category: 'Manga / Manhwa',
    className: 'font-manhwa-dialogue',
    fontFamily: "var(--font-comic), 'Comic Neue', sans-serif",
    description: 'Standard comic lettering font optimized for smooth dialogue reading.',
    defaultTransform: 'uppercase',
    previewSample: 'Hello! How are you doing?',
  },
  {
    id: 'bangers',
    name: 'Bangers (Screams / Action)',
    shortLabel: 'Bangers',
    category: 'Action / Shonen',
    className: 'font-manhwa-scream',
    fontFamily: "var(--font-bangers), 'Bangers', cursive, sans-serif",
    description: 'Bold condensed display font for attacks, shouts, and high-tension lines.',
    defaultTransform: 'uppercase',
    previewSample: 'WATCH OUT BEHIND YOU!',
  },
  {
    id: 'cormorant',
    name: 'Cormorant (Thoughts / Narrator)',
    shortLabel: 'Cormorant',
    category: 'Elegant / Serif',
    className: 'font-manhwa-thought',
    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Garamond, serif",
    description: 'Refined serif typeface for poetic monologues, whispered thoughts, and flashbacks.',
    defaultTransform: 'none',
    previewSample: 'That day, everything changed...',
  },
  {
    id: 'permanent-marker',
    name: 'Permanent Marker (SFX / Effects)',
    shortLabel: 'Marker',
    category: 'SFX / Sound Effects',
    className: 'font-manhwa-sfx',
    fontFamily: "var(--font-marker), 'Permanent Marker', cursive, sans-serif",
    description: 'Dynamic marker brush style for hand-drawn onomatopoeia and sound effects.',
    defaultTransform: 'uppercase',
    previewSample: 'BOOM! CRASH!',
  },
  {
    id: 'sans',
    name: 'Inter (Modern / UI)',
    shortLabel: 'Inter',
    category: 'Sans-Serif',
    className: 'font-sans font-bold',
    fontFamily: "var(--font-sans), 'Inter', sans-serif",
    description: 'Clean modern sans-serif for text messages, system notifications, and UI screens.',
    defaultTransform: 'none',
    previewSample: 'New message received.',
  },
]

export const FONTS_LIST = FONTS_LIST_FR

export function getFontsList(locale?: string): FontOption[] {
  return detectLocale(locale) === 'en' ? FONTS_LIST_EN : FONTS_LIST_FR
}

export const COLOR_SWATCHES_FR = [
  { label: 'Blanc', value: '#ffffff', border: true },
  { label: 'Noir', value: '#0d0d0d', border: false },
  { label: 'Cyan', value: '#00e5ff', border: false },
  { label: 'Rouge', value: '#e11d48', border: false },
  { label: 'Jaune', value: '#fbbf24', border: false },
  { label: 'Violet', value: '#a855f7', border: false },
  { label: 'Vert', value: '#10b981', border: false },
]

export const COLOR_SWATCHES_EN = [
  { label: 'White', value: '#ffffff', border: true },
  { label: 'Black', value: '#0d0d0d', border: false },
  { label: 'Cyan', value: '#00e5ff', border: false },
  { label: 'Red', value: '#e11d48', border: false },
  { label: 'Yellow', value: '#fbbf24', border: false },
  { label: 'Purple', value: '#a855f7', border: false },
  { label: 'Green', value: '#10b981', border: false },
]

export const COLOR_SWATCHES = COLOR_SWATCHES_FR

export function getColorSwatches(locale?: string) {
  return detectLocale(locale) === 'en' ? COLOR_SWATCHES_EN : COLOR_SWATCHES_FR
}

export const FONT_SIZE_SCALES_FR = [
  { value: 0.6, label: '60 % (Très petit)' },
  { value: 0.75, label: '75 % (Petit)' },
  { value: 0.9, label: '90 % (Discret)' },
  { value: 1.0, label: '100 % (Standard)' },
  { value: 1.15, label: '115 % (Légèrement agrandi)' },
  { value: 1.3, label: '130 % (Moyen)' },
  { value: 1.5, label: '150 % (Grand)' },
  { value: 1.75, label: '175 % (Très grand)' },
  { value: 2.0, label: '200 % (Impact max)' },
]

export const FONT_SIZE_SCALES_EN = [
  { value: 0.6, label: '60% (Tiny)' },
  { value: 0.75, label: '75% (Small)' },
  { value: 0.9, label: '90% (Compact)' },
  { value: 1.0, label: '100% (Standard)' },
  { value: 1.15, label: '115% (Slightly larger)' },
  { value: 1.3, label: '130% (Medium)' },
  { value: 1.5, label: '150% (Large)' },
  { value: 1.75, label: '175% (Very large)' },
  { value: 2.0, label: '200% (Max impact)' },
]

export const FONT_SIZE_SCALES = FONT_SIZE_SCALES_FR

export function getFontSizeScales(locale?: string) {
  return detectLocale(locale) === 'en' ? FONT_SIZE_SCALES_EN : FONT_SIZE_SCALES_FR
}

export const STROKE_OPTIONS_FR = [
  { value: 'white', label: 'Contour blanc' },
  { value: 'black', label: 'Contour noir' },
  { value: 'none', label: 'Sans contour' },
]

export const STROKE_OPTIONS_EN = [
  { value: 'white', label: 'White outline' },
  { value: 'black', label: 'Black outline' },
  { value: 'none', label: 'No outline' },
]

export const STROKE_OPTIONS = STROKE_OPTIONS_FR

export function getStrokeOptions(locale?: string) {
  return detectLocale(locale) === 'en' ? STROKE_OPTIONS_EN : STROKE_OPTIONS_FR
}

export const STROKE_WIDTHS = [
  { value: 1, label: '1 px' },
  { value: 2, label: '2 px' },
  { value: 3, label: '3 px' },
  { value: 4, label: '4 px' },
]

/** Normalise les identifiants historiques vers les identifiants modernes. */
export function normalizeFontId(id?: string | null): string {
  if (!id) return 'comic-neue'
  const clean = id.trim().toLowerCase()
  switch (clean) {
    case 'cinzel':
    case 'system':
      return 'cinzel'
    case 'bangers':
    case 'scream':
      return 'bangers'
    case 'permanent-marker':
    case 'sfx':
      return 'permanent-marker'
    case 'cormorant':
    case 'thought':
      return 'cormorant'
    case 'sans':
    case 'inter':
      return 'sans'
    case 'comic-neue':
    case 'dialogue':
    default:
      return 'comic-neue'
  }
}

/** Résout la classe CSS correspondante à une police. */
export function getFontClassName(id?: string | null): string {
  const norm = normalizeFontId(id)
  const font = FONTS_LIST.find((f) => f.id === norm)
  return font ? font.className : 'font-manhwa-dialogue'
}

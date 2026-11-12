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

export const FONTS_LIST: FontOption[] = [
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
    name: 'Comic Neue (Dialogue Standard)',
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

export const COLOR_SWATCHES = [
  { label: 'Blanc', value: '#ffffff', border: true },
  { label: 'Noir', value: '#0d0d0d', border: false },
  { label: 'Cyan', value: '#00e5ff', border: false },
  { label: 'Rouge', value: '#e11d48', border: false },
  { label: 'Jaune', value: '#fbbf24', border: false },
  { label: 'Violet', value: '#a855f7', border: false },
  { label: 'Vert', value: '#10b981', border: false },
]

export const FONT_SIZE_SCALES = [
  { value: 0.6, label: '60% (Très petit)' },
  { value: 0.75, label: '75% (Petit)' },
  { value: 0.9, label: '90% (Discret)' },
  { value: 1.0, label: '100% (Standard)' },
  { value: 1.15, label: '115% (Légèrement agrandi)' },
  { value: 1.3, label: '130% (Moyen)' },
  { value: 1.5, label: '150% (Grand)' },
  { value: 1.75, label: '175% (Très grand)' },
  { value: 2.0, label: '200% (Impact max)' },
]

export const STROKE_OPTIONS = [
  { value: 'white', label: 'Contour Blanc' },
  { value: 'black', label: 'Contour Noir' },
  { value: 'none', label: 'Sans contour' },
]

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

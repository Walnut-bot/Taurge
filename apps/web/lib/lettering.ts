/**
 * Lettering helpers for bubble text overlays.
 *
 * Pure functions (no DOM): given a translated string and the available box
 * size in pixels, pick balanced line breaks and estimate the largest font
 * size that fits. The `TextOverlay` component refines this estimate with a
 * DOM measurement pass, so the estimate only needs to be close.
 */

export type LetteringFitOptions = {
  /** Average glyph advance as a fraction of the font size. Default 0.58. */
  charWidthRatio?: number
  /** Line height multiplier. Default 1.08. */
  lineHeight?: number
  /** Floor for the estimated font size in px. Default 8. */
  minFontSize?: number
  /** Ceiling for the estimated font size in px. Default 160. */
  maxFontSize?: number
  /** Maximum lines per paragraph. Default 10. */
  maxLines?: number
}

export type LetteringFit = {
  /** Balanced lines, in reading order. Empty when the text is blank. */
  lines: string[]
  /** Estimated font size in px that fills the box without overflowing. */
  fontSize: number
}

const DEFAULTS = {
  charWidthRatio: 0.58,
  lineHeight: 1.08,
  minFontSize: 8,
  maxFontSize: 160,
  maxLines: 10,
} as const

function normalizeParagraph(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Split words into exactly `lineCount` lines, minimizing the longest line
 * (in characters, spaces included). Order-preserving dynamic program.
 */
export function partitionWords(words: string[], lineCount: number): string[][] {
  const n = words.length
  const k = Math.max(1, Math.min(lineCount, n))
  const lengths = words.map((w) => w.length)
  const prefix = new Array<number>(n + 1).fill(0)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + lengths[i]
  // Width of words[j..i) on one line, single spaces between words.
  const lineWidth = (j: number, i: number) => prefix[i] - prefix[j] + Math.max(0, i - j - 1)

  // dp[l][i] = best (smallest) max-line-width for words[0..i) in l lines.
  const dp: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity))
  const parent: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0))
  dp[0][0] = 0
  for (let i = 1; i <= n; i++) {
    dp[1][i] = lineWidth(0, i)
    parent[1][i] = 0
  }
  for (let l = 2; l <= k; l++) {
    for (let i = l; i <= n; i++) {
      for (let j = l - 1; j <= i - 1; j++) {
        const candidate = Math.max(dp[l - 1][j], lineWidth(j, i))
        if (candidate < dp[l][i]) {
          dp[l][i] = candidate
          parent[l][i] = j
        }
      }
    }
  }

  const lines: string[][] = []
  let l = k
  let i = n
  while (l > 0) {
    const j = parent[l][i]
    lines.unshift(words.slice(j, i))
    i = j
    l--
  }
  return lines
}

function maxLineChars(lines: string[][]): number {
  let max = 0
  for (const line of lines) {
    const width = line.reduce((acc, w) => acc + w.length, 0) + Math.max(0, line.length - 1)
    if (width > max) max = width
  }
  return max
}

/**
 * Wrap one paragraph: try every line count and keep the one allowing the
 * biggest font size for the given box. Ties keep the fewest lines.
 */
function wrapParagraph(
  words: string[],
  availW: number,
  availH: number,
  ratio: number,
  lineHeight: number,
  maxLines: number,
): string[][] {
  const limit = Math.max(1, Math.min(maxLines, words.length))
  let best = partitionWords(words, 1)
  let bestSize = fittingSize(maxLineChars(best), 1, availW, availH, ratio, lineHeight)
  for (let k = 2; k <= limit; k++) {
    const candidate = partitionWords(words, k)
    const size = fittingSize(maxLineChars(candidate), k, availW, availH, ratio, lineHeight)
    if (size > bestSize) {
      best = candidate
      bestSize = size
    }
  }
  return best
}

function fittingSize(
  chars: number,
  lines: number,
  availW: number,
  availH: number,
  ratio: number,
  lineHeight: number,
): number {
  if (chars <= 0 || lines <= 0) return Infinity
  return Math.min(availW / (chars * ratio), availH / (lines * lineHeight))
}

export function fitLettering(
  text: string,
  availW: number,
  availH: number,
  options: LetteringFitOptions = {},
): LetteringFit {
  const ratio = options.charWidthRatio ?? DEFAULTS.charWidthRatio
  const lineHeight = options.lineHeight ?? DEFAULTS.lineHeight
  const minFontSize = options.minFontSize ?? DEFAULTS.minFontSize
  const maxFontSize = options.maxFontSize ?? DEFAULTS.maxFontSize
  const maxLines = options.maxLines ?? DEFAULTS.maxLines

  const paragraphs = text
    .split('\n')
    .map(normalizeParagraph)
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0 || availW <= 0 || availH <= 0) {
    return { lines: [], fontSize: minFontSize }
  }

  const wordsPerParagraph = paragraphs.map((p) => p.split(' '))
  const totalWords = wordsPerParagraph.reduce((acc, words) => acc + words.length, 0)

  const wrapped = wordsPerParagraph.map((words) => {
    // Height budget proportional to the word count, so a short paragraph
    // does not steal line breaks from a long one.
    const share = totalWords > 0 ? words.length / totalWords : 1 / wordsPerParagraph.length
    const budgetH = Math.max(availH * share, availH / wordsPerParagraph.length / 2)
    return wrapParagraph(words, availW, budgetH, ratio, lineHeight, maxLines)
  })

  const lines = wrapped.flat().map((line) => line.join(' '))
  const totalLines = lines.length
  const widest = Math.max(0, ...lines.map((l) => l.length))
  const estimated = fittingSize(widest, totalLines, availW, availH, ratio, lineHeight)
  const fontSize = Math.min(maxFontSize, Math.max(minFontSize, estimated))

  return { lines, fontSize }
}

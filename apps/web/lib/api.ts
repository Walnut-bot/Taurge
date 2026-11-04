import { demo } from './demo-store'
import type {
  ExportRecord,
  PageImageVariant,
  Project,
  ProjectCreate,
  ProjectDetail,
  SourceFile,
  User,
} from './types'

// Normalisée sans slash final : `https://api…/` + `/auth/register`
// produirait `//auth/register`, que FastAPI ne reconnaît pas (404).
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').trim().replace(/\/+$/, '')
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1'

const TOKEN_KEY = 'taurge_token'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Langue d'interface courante, transmise au backend FastAPI via
 * `Accept-Language` pour localiser ses messages d'erreur (Ã‰tape 4).
 * Source de vÃ©ritÃ© : le cookie `NEXT_LOCALE`, repli sur l'URL `/fr|en/â€¦`.
 */
export function getClientLocale(): string {
  if (typeof window === 'undefined') return 'fr'
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('NEXT_LOCALE='))
    ?.split('=')[1]
  if (cookie === 'fr' || cookie === 'en') return cookie
  const segment = window.location.pathname.split('/')[1]
  return segment === 'en' ? 'en' : 'fr'
}

function localeHeaders(): Record<string, string> {
  return { 'Accept-Language': getClientLocale() }
}

async function parseError(res: Response) {
  const body = await res.json().catch(() => ({}))
  const detail = Array.isArray(body.detail)
    ? body.detail.map((d: { msg?: string }) => d.msg).join(' ')
    : body.detail
  if (res.status === 401) clearToken()
  return new ApiError(detail || `Error ${res.status}`, res.status)
}

async function request<T>(path: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  let res: Response
  const timeoutMs = options.timeoutMs ?? 30000
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        signal: options.signal || controller.signal,
        headers: { 'Content-Type': 'application/json', ...localeHeaders(), ...authHeaders(), ...options.headers },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError(`The server is taking too long to respond (${Math.round(timeoutMs / 1000)}s timeout exceeded).`, 408)
    }
    throw new ApiError('Cannot reach the Taurge server. Make sure the FastAPI service is running on http://localhost:8000.', 0)
  }
  if (!res.ok) {
    if (res.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taurge:credits-exhausted'))
    }
    throw await parseError(res)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json().catch(() => undefined as T)
}

async function requestBlob(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { ...localeHeaders(), ...authHeaders() } })
  if (!res.ok) throw await parseError(res)
  return res.blob()
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const post = <T = unknown>(path: string, body?: unknown, timeoutMs?: number) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, timeoutMs })

const patch = <T = unknown>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })

export const api = {
  async login(email: string, password: string) {
    const token = IS_DEMO
      ? await demo.login(email, password)
      : (await post<{ access_token: string }>('/auth/login', { email, password })).access_token
    saveToken(token)
  },
  register(
    email: string,
    password: string,
    consents?: { accepted_terms: boolean; age_confirmed: boolean; newsletter_opt_in: boolean },
  ) {
    return IS_DEMO
      ? demo.register(email, password)
      : post('/auth/register', { email, password, ...(consents ?? {}) })
  },
  deleteAccount(confirmEmail: string): Promise<void> {
    return request<void>('/auth/me', { method: 'DELETE', body: JSON.stringify({ confirm_email: confirmEmail }) })
  },
  me(): Promise<User> {
    return IS_DEMO ? demo.me() : request('/auth/me')
  },
  updateProfile(payload: Partial<Pick<User, 'display_name' | 'default_content_type' | 'default_source_lang' | 'default_target_lang'>>): Promise<User> {
    return IS_DEMO ? demo.updateProfile(payload) : patch('/auth/me/profile', payload)
  },
  async uploadProfileImage(kind: 'avatar' | 'banner', file: File): Promise<User> {
    if (IS_DEMO) return demo.uploadProfileImage(kind, file)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/auth/me/profile/${kind}`, {
      method: 'PUT',
      headers: { ...localeHeaders(), ...authHeaders() },
      body: formData,
    })
    if (!res.ok) throw await parseError(res)
    return res.json()
  },
  async profileImage(kind: 'avatar' | 'banner'): Promise<Blob> {
    if (IS_DEMO) return demo.profileImage(kind)
    return requestBlob(`/auth/me/profile/${kind}`)
  },
  async deleteProfileImage(kind: 'avatar' | 'banner'): Promise<User> {
    if (IS_DEMO) return demo.deleteProfileImage(kind)
    return request<User>(`/auth/me/profile/${kind}`, { method: 'DELETE' })
  },
  listProjects(): Promise<Project[]> {
    return IS_DEMO ? demo.listProjects() : request('/projects')
  },
  getProject(id: string): Promise<ProjectDetail> {
    return IS_DEMO ? demo.getProject(id) : request(`/projects/${id}`)
  },
  createProject(payload: ProjectCreate): Promise<Project> {
    return IS_DEMO ? demo.createProject(payload) : post('/projects', payload)
  },
  renameProject(projectId: string, name: string): Promise<Project> {
    return patch<Project>(`/projects/${projectId}`, { name })
  },
  billingPacks(): Promise<{
    packs: { key: string; credits: number; price_eur_cents: number }[]
    providers: Record<string, boolean>
  }> {
    return request('/billing/packs')
  },
  createCheckout(pack: string, provider: 'fedapay' | 'paddle'): Promise<{ checkout_url: string }> {
    return post('/billing/checkout', { pack, provider })
  },
  billingHistory(): Promise<{
    month_credits_used: number
    entries: {
      id: string
      action_type: string
      amount: number
      description: string | null
      project_id: string | null
      created_at: string
    }[]
  }> {
    return request('/billing/history')
  },
  async upload(projectId: string, file: File): Promise<SourceFile> {
    if (IS_DEMO) return demo.upload(projectId, file)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/projects/${projectId}/upload`, {
      method: 'POST',
      headers: { ...localeHeaders(), ...authHeaders() },
      body: formData,
    })
    if (!res.ok) throw await parseError(res)
    return res.json()
  },
  extract(
    projectId: string,
    fileId: string,
  ): Promise<{ job_id: string; status: string; message: string } | undefined> {
    return IS_DEMO
      ? demo.extract(projectId, fileId).then(() => undefined)
      : post<{ job_id: string; status: string; message: string }>(
          `/jobs/projects/${projectId}/files/${fileId}/start-extraction`,
        )
  },
  runOcr(projectId: string, pageId: string) {
    // Premier appel long : chargement du moteur OCR + lecture de la page.
    // Le délai par défaut (30 s) avortait ce premier essai, le second passait.
    return IS_DEMO ? demo.runOcr(projectId, pageId) : post(`/projects/${projectId}/pages/${pageId}/ocr`, undefined, 300_000)
  },
  translatePage(projectId: string, pageId: string) {
    // Traduction LLM locale lente + repli DeepL : le délai par défaut
    // (30 s) avortait l'appel alors que le serveur finissait ensuite.
    return IS_DEMO
      ? demo.translatePage(projectId, pageId)
      : post(`/projects/${projectId}/pages/${pageId}/translate`, undefined, 300_000)
  },
  cleanPage(projectId: string, pageId: string) {
    return IS_DEMO
      ? demo.cleanPage(projectId, pageId)
      : post(`/projects/${projectId}/pages/${pageId}/clean`, undefined, 300_000)
  },
  processPageFull(projectId: string, pageId: string) {
    return post<import('./types').Page>(`/projects/${projectId}/pages/${pageId}/process-full`, undefined, 300_000)
  },
  batchProcess(projectId: string, options?: { include_ocr?: boolean; include_translate?: boolean; include_clean?: boolean }) {
    return post<{
      processed_pages: number
      ocr_blocks_count: number
      translations_count: number
      cleaned_pages_count: number
    }>(`/projects/${projectId}/batch-process`, options ?? {}, 900_000)
  },
  createBlock(payload: {
    page_id: string
    bbox_x: number
    bbox_y: number
    bbox_w: number
    bbox_h: number
    text?: string
    bubble_type?: string
  }): Promise<import('./types').OcrBlock> {
    return post<import('./types').OcrBlock>('/ocr-blocks', payload)
  },
  updateBlockText(blockId: string, text: string) {
    return IS_DEMO ? demo.updateBlockText(blockId, text) : patch(`/ocr-blocks/${blockId}`, { text })
  },
  updateBlockBbox(blockId: string, bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) {
    return patch(`/ocr-blocks/${blockId}`, bbox)
  },
  updateBlockType(blockId: string, bubble_type: string) {
    return patch(`/ocr-blocks/${blockId}`, { bubble_type })
  },
  updateTranslation(translationId: string, text: string) {
    return IS_DEMO
      ? demo.updateTranslation(translationId, text)
      : patch(`/translations/${translationId}`, { translated_text: text })
  },
  retranslate(blockId: string) {
    return IS_DEMO ? demo.retranslate(blockId) : post(`/ocr-blocks/${blockId}/retranslate`, undefined, 300_000)
  },
  deleteProject(projectId: string): Promise<void> {
    return request<void>(`/projects/${projectId}`, { method: 'DELETE' })
  },
  deleteBlock(blockId: string): Promise<void> {
    return request<void>(`/ocr-blocks/${blockId}`, { method: 'DELETE' })
  },
  listGlossary(projectId: string): Promise<import('./types').GlossaryEntry[]> {
    return request<import('./types').GlossaryEntry[]>(`/projects/${projectId}/glossary`)
  },
  createGlossaryEntry(projectId: string, entry: Omit<import('./types').GlossaryEntry, 'id' | 'project_id'>): Promise<import('./types').GlossaryEntry> {
    return post<import('./types').GlossaryEntry>(`/projects/${projectId}/glossary`, entry)
  },
  deleteGlossaryEntry(projectId: string, entryId: string): Promise<void> {
    return request<void>(`/projects/${projectId}/glossary/${entryId}`, { method: 'DELETE' })
  },
  exportProject(projectId: string, format?: 'zip' | 'cbz' | 'pdf'): Promise<ExportRecord> {
    const query = format ? `?format=${format}` : ''
    return IS_DEMO ? demo.exportProject(projectId) : post(`/projects/${projectId}/export${query}`)
  },
  async downloadExport(projectId: string, exportId: string, filename: string) {
    if (IS_DEMO) {
      const { blob, filename: name } = await demo.downloadExport(projectId, filename)
      return triggerDownload(blob, name)
    }
    const blob = await requestBlob(`/exports/${exportId}/download`)
    triggerDownload(blob, filename)
  },
  /** Returns a displayable URL. In API mode the caller must revoke it when done. */
  async pageImage(pageId: string, variant: PageImageVariant) {
    if (IS_DEMO) return { url: await demo.pageImage(pageId, variant), revocable: false }
    const path = variant === 'cleaned' ? `/pages/${pageId}/cleaned-image` : `/pages/${pageId}/image`
    return { url: URL.createObjectURL(await requestBlob(path)), revocable: true }
  },
  // Resilient background job control
  startBatchJob(projectId: string): Promise<{ job_id: string; status: string; message: string }> {
    return post(`/jobs/projects/${projectId}/start-batch`)
  },
  getJobStatus(jobId: string): Promise<{
    id: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    current_page: number
    total_pages: number
    progress_percent: number
    message: string
  }> {
    return request(`/jobs/${jobId}`)
  },
  cancelJob(jobId: string): Promise<{ status: string; message: string }> {
    return post(`/jobs/${jobId}/cancel`)
  },
  updateBlockStyle(blockId: string, style: {
    manhwa_style?: string
    rotation_angle?: number
    font_size_scale?: number
    text_color?: string
    stroke_color?: string
    stroke_width?: number
  }) {
    return patch(`/ocr-blocks/${blockId}`, style)
  },// Team management & scanlation workflow
  listMembers(projectId: string): Promise<import('./types').ProjectMember[]> {
    return request(`/projects/${projectId}/members`)
  },
  inviteMember(projectId: string, email: string, role: string): Promise<import('./types').ProjectMember> {
    return post(`/projects/${projectId}/members`, { email, role })
  },
  removeMember(projectId: string, memberId: string): Promise<void> {
    return request(`/projects/${projectId}/members/${memberId}`, { method: 'DELETE' })
  },
  updatePageWorkflowStatus(projectId: string, pageId: string, workflow_status: string) {
    return patch(`/projects/${projectId}/pages/${pageId}/workflow-status`, { workflow_status })
  },
  reorderPages(projectId: string, pageIds: string[]): Promise<{ page_ids: string[] }> {
    return patch(`/projects/${projectId}/pages/reorder`, { page_ids: pageIds })
  },
}

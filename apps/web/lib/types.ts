export type ContentType = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'comic' | 'autre'

export type ScanlationRole = 'owner' | 'translator' | 'cleaner' | 'typesetter' | 'proofreader'

export type ProjectMember = {
  id: string
  user_id: string
  email: string
  role: ScanlationRole
  joined_at: string
}

export type Translation = {
  id: string
  translated_text: string
  provider: string
  edited_by_user: boolean
}

export type OcrBlock = {
  id: string
  text: string
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
  confidence: number
  provider: string
  bubble_type?: string
  manhwa_style?: 'dialogue' | 'scream' | 'system' | 'thought' | 'sfx' | 'cinzel' | 'comic-neue' | 'bangers' | 'cormorant' | 'permanent-marker' | 'sans' | (string & {})
  rotation_angle?: number
  font_size_scale?: number
  text_color?: string
  stroke_color?: string
  stroke_width?: number
  translation: Translation | null
}

export type Page = {
  id: string
  source_file_id: string
  page_number: number
  width: number | null
  height: number | null
  created_at: string
  ocr_blocks: OcrBlock[]
  cleaned_at: string | null
  workflow_status?: 'raw' | 'cleaned' | 'translated' | 'typeset' | 'ready'
}

export type SourceFile = {
  id: string
  original_filename: string
  file_type: string
  size_bytes: number
  created_at: string
}

export type ExportRecord = {
  id: string
  format: string
  created_at: string
}

export type Project = {
  id: string
  name: string
  source_lang: string
  target_lang: string
  content_type: string
  created_at: string
}

export type ProjectDetail = Project & {
  files: SourceFile[]
  pages: Page[]
  exports: ExportRecord[]
}

export type User = {
  id: string
  email: string
  display_name?: string | null
  avatar_content_type?: string | null
  banner_content_type?: string | null
  default_content_type?: ContentType
  default_source_lang?: string
  default_target_lang?: string
  project_roles?: ProjectRole[]
  plan?: string
  credits_remaining?: number
  credits_limit?: number
  newsletter_opt_in?: boolean
  is_admin?: boolean
  created_at?: string | null
}

export type SystemStatus = {
  manga_ocr_installed: boolean
  paddle_ocr_installed: boolean
  tesseract_installed: boolean
  tesseract_langs: string[]
  ollama_configured: boolean
  ollama_model: string
  deepl_configured: boolean
}

export type ProjectRole = {
  project_id: string
  project_name: string
  role: ScanlationRole
}

export type ProjectCreate = {
  name: string
  source_lang: string
  target_lang: string
  content_type: string
}

export type PageImageVariant = 'original' | 'cleaned'

export type GlossaryCategory = 'character' | 'location' | 'term' | 'sfx'

export type GlossaryEntry = {
  id: string
  project_id: string
  category: GlossaryCategory
  source_term: string
  target_term: string
  is_locked: boolean
  notes?: string | null
}

export type QCIssue = {
  severity: 'error' | 'warning' | 'suggestion'
  code: string
  page_id: string
  page_number: number
  ocr_block_id?: string | null
  message: string
  suggestion?: string | null
}

export type QCReport = {
  project_id: string
  error_count: number
  warning_count: number
  suggestion_count: number
  issues: QCIssue[]
}

export type TranslationMemoryMatch = {
  source_text: string
  translated_text: string
  similarity: number
  edited_by_user: boolean
  project_id: string
  project_name: string
}

export type PageComment = {
  id: string
  project_id: string
  page_id: string
  ocr_block_id?: string | null
  author_id: string
  author_email: string
  content: string
  is_resolved: boolean
  created_at: string
}

export type PageVersion = {
  id: string
  project_id: string
  page_id: string
  version_number: number
  label: string
  created_by_email: string
  blocks_count: number
  created_at: string
}

export type AdminStats = {
  users_count: number
  projects_count: number
  pages_count: number
  active_jobs_count: number
  failed_jobs_count: number
  total_credits_used: number
  paid_transactions_count: number
}

export type AdminUser = {
  id: string
  email: string
  display_name?: string | null
  is_admin: boolean
  plan: string
  credits_remaining: number
  projects_count: number
  created_at: string
}

export type AdminJob = {
  id: string
  project_id: string
  user_id?: string | null
  job_type: string
  status: string
  progress_percent: number
  message: string
  error_message?: string | null
  created_at: string
}


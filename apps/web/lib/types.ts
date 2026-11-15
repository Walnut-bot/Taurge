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

export interface WatermarkConfig {
  image_url: string // data URL ou URL d'image
  x: number // position horizontale (0 à 100%)
  y: number // position verticale (0 à 100%)
  scale: number // taille relative à la page (ex: 0.20 = 20%)
  opacity: number // opacité (0.1 à 1.0)
  rotation: number // rotation en degrés (-180 à 180)
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
  watermark?: string | null
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

export type CreditBalanceDetailed = {
  plan: string
  status: string
  available_credits: number
  monthly_credits_remaining: number
  monthly_credits_limit: number
  purchased_credits_remaining: number
  reserved_credits: number
  current_period_end: string | null
  credits_remaining: number
  credits_limit: number
}

export type CostEstimate = {
  action_type: string
  engine: string
  engine_label: string
  unit_cost: number
  total_cost: number
  page_count: number
}

export type BillingPlan = {
  id: string
  name_fr: string
  name_en: string
  price_eur: number
  monthly_credits: number
  max_active_projects: number
  max_storage_mb: number
  max_team_members?: number
  features_fr: string[]
  features_en: string[]
  recommended?: boolean
  on_quote?: boolean
}

export type CreditPack = {
  key: string
  name_fr: string
  name_en: string
  credits: number
  price_eur: number
  price_eur_cents: number
  recommended: boolean
  unit_price_cents: number
}

export type DeepLQuotaStatus = {
  period_month: string
  chars_used: number
  chars_limit: number
  chars_remaining: number
  percent_used?: number
  usage_percent?: number
  alert_level?: 'normal' | 'notice' | 'warning' | 'critical' | 'exhausted'
  is_blocked?: boolean
  requests_count?: number
  top_users?: { user_id: string; email: string; chars: number }[]
}

export type UsageLedgerItem = {
  id: string
  action_type: string
  amount: number
  origin?: string
  engine_used?: string | null
  source_chars_count?: number | null
  cost_provider_actual?: number | null
  status: string
  description: string
  created_at: string
}

export type ProfitabilityMetrics = {
  total_revenue_eur: number
  total_provider_cost_eur: number
  gross_margin_eur: number
  gross_margin_percent: number
  engine_stats?: Record<string, { count: number; credits: number; provider_cost: number }>
  period_month?: string
  estimated_gross_margin_eur?: number
  deepl_chars_billed?: number
  deepl_cost_eur?: number
  active_subscribers_by_plan?: Record<string, number>
}


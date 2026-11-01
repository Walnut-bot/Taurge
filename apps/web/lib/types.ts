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
  manhwa_style?: 'dialogue' | 'scream' | 'system' | 'thought' | 'sfx'
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
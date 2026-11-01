import type {
  ExportRecord,
  OcrBlock,
  Page,
  PageImageVariant,
  Project,
  ProjectCreate,
  ProjectDetail,
  SourceFile,
  Translation,
  User,
} from './types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()

type DemoProject = ProjectDetail
type ImageSource = { original: string; cleaned?: string }

let demoUser: User = { id: 'demo-user', email: 'demo@taurge.app' }
const profileMedia = new Map<'avatar' | 'banner', File>()

const KNOWN_TRANSLATIONS: Record<string, string> = {
  'らっしゃい！特製醤油、お待たせしました！': 'Welcome in! Here comes your house shoyu!',
  'ほか…': 'Steaming…',
  'わぁ、美味しそう！いただきます！': 'Wow, that looks so good! Thanks for the food!',
  'その日も、暖かな灯りに誘われて、いつもの店へ。':
    'That day too, drawn in by the warm light, I headed to my usual little shop.',
  '…やっぱり、この街は寂しいな。': '…Honestly, this town is so gloomy.',
  'えっ、きみ…！？': 'Huh, you…!?',
  '傘、一緒に入りなよ。': 'Come share my umbrella.',
}

function block(
  text: string,
  [x, y, w, h]: [number, number, number, number],
  confidence: number,
  translation?: Partial<Translation> & { translated_text: string },
): OcrBlock {
  return {
    id: uid(),
    text,
    bbox_x: x,
    bbox_y: y,
    bbox_w: w,
    bbox_h: h,
    confidence,
    provider: 'paddleocr',
    translation: translation
      ? { id: uid(), provider: 'ollama', edited_by_user: false, ...translation }
      : null,
  }
}

function seed() {
  const fileId = uid()
  const page1: Page = {
    id: uid(),
    source_file_id: fileId,
    page_number: 1,
    width: 848,
    height: 1264,
    created_at: now(),
    cleaned_at: now(),
    ocr_blocks: [
      block('…やっぱり、この街は寂しいな。', [140, 90, 175, 245], 0.91, {
        translated_text: '…Honestly, this town is so gloomy.',
        edited_by_user: true,
      }),
      block('えっ、きみ…！？', [600, 630, 135, 175], 0.84, {
        translated_text: 'Huh, you…!?',
      }),
      block('傘、一緒に入りなよ。', [625, 895, 140, 195], 0.88, {
        translated_text: 'Come share my umbrella.',
      }),
    ],
  }
  const page2: Page = {
    id: uid(),
    source_file_id: fileId,
    page_number: 2,
    width: 848,
    height: 1264,
    created_at: now(),
    cleaned_at: null,
    ocr_blocks: [
      block('らっしゃい！特製醤油、お待たせしました！', [345, 45, 145, 185], 0.87),
      block('ほか…', [545, 125, 65, 100], 0.62),
      block('わぁ、美味しそう！いただきます！', [660, 450, 115, 190], 0.9),
      block('その日も、暖かな灯りに誘われて、いつもの店へ。', [70, 862, 135, 238], 0.93),
    ],
  }

  const images = new Map<string, ImageSource>([
    [page1.id, { original: '/demo/page-01.png' }],
    [page2.id, { original: '/demo/page-02.png' }],
  ])

  const projects: DemoProject[] = [
    {
      id: 'pluie-koenji',
      name: 'Rain over Kōenji — Chapter 1',
      source_lang: 'ja',
      target_lang: 'en',
      content_type: 'manga',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      files: [
        {
          id: fileId,
          original_filename: 'koenji_ch01_raw.pdf',
          file_type: 'pdf',
          size_bytes: 4_812_330,
          created_at: now(),
        },
      ],
      pages: [page1, page2],
      exports: [],
    },
    {
      id: 'hors-serie',
      name: 'Morning Bubbles — One-shot',
      source_lang: 'ko',
      target_lang: 'en',
      content_type: 'webtoon',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
      files: [],
      pages: [],
      exports: [],
    },
  ]

  return { projects, images, pendingUploads: new Map<string, string>() }
}

let state = seed()

function findProject(id: string) {
  const p = state.projects.find((x) => x.id === id)
  if (!p) throw new Error('Project not found.')
  return p
}

function findPage(projectId: string, pageId: string) {
  const page = findProject(projectId).pages.find((p) => p.id === pageId)
  if (!page) throw new Error('Page not found.')
  return page
}

function findBlock(blockId: string) {
  for (const p of state.projects)
    for (const page of p.pages)
      for (const b of page.ocr_blocks) if (b.id === blockId) return { block: b, project: p }
  throw new Error('Block not found.')
}

function clone<T>(v: T): T {
  return structuredClone(v)
}

function fakeTranslate(text: string, target: string) {
  return KNOWN_TRANSLATIONS[text] ?? `[${target}] ${text}`
}

export const demo = {
  async login(email: string, password: string) {
    await wait(450)
    if (!email.includes('@')) throw new Error('Invalid email address.')
    if (password.length < 8) throw new Error('Incorrect email or password.')
    return 'demo-token'
  },
  async register(email: string, password: string) {
    await wait(500)
    if (!email.includes('@')) throw new Error('Invalid email address.')
    if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  },
  async me() {
    await wait(120)
    return clone(demoUser)
  },
  async updateProfile(payload: Partial<Pick<User, 'display_name' | 'default_content_type' | 'default_source_lang' | 'default_target_lang'>>) {
    await wait(150)
    demoUser = { ...demoUser, ...payload }
    return clone(demoUser)
  },
  async uploadProfileImage(kind: 'avatar' | 'banner', file: File) {
    await wait(150)
    profileMedia.set(kind, file)
    const key = kind === 'avatar' ? 'avatar_content_type' : 'banner_content_type'
    demoUser = { ...demoUser, [key]: file.type }
    return clone(demoUser)
  },
  async profileImage(kind: 'avatar' | 'banner') {
    await wait(80)
    const file = profileMedia.get(kind)
    if (!file) throw new Error('No profile image.')
    return file
  },
  async deleteProfileImage(kind: 'avatar' | 'banner') {
    await wait(120)
    profileMedia.delete(kind)
    const key = kind === 'avatar' ? 'avatar_content_type' : 'banner_content_type'
    demoUser = { ...demoUser, [key]: null }
    return clone(demoUser)
  },
  async listProjects(): Promise<Project[]> {
    await wait(250)
    return state.projects
      .map(({ files: _f, pages: _p, exports: _e, ...rest }) => rest)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },
  async getProject(id: string): Promise<ProjectDetail> {
    await wait(220)
    return clone(findProject(id))
  },
  async createProject(payload: ProjectCreate): Promise<Project> {
    await wait(400)
    const project: DemoProject = {
      id: uid(),
      ...payload,
      created_at: now(),
      files: [],
      pages: [],
      exports: [],
    }
    state.projects.push(project)
    return project
  },
  async upload(projectId: string, file: File): Promise<SourceFile> {
    await wait(900)
    const project = findProject(projectId)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const record: SourceFile = {
      id: uid(),
      original_filename: file.name,
      file_type: ext === 'jpeg' ? 'jpg' : ext,
      size_bytes: file.size,
      created_at: now(),
    }
    if (ext !== 'pdf') state.pendingUploads.set(record.id, URL.createObjectURL(file))
    project.files.push(record)
    return record
  },
  async extract(projectId: string, fileId: string) {
    await wait(1100)
    const project = findProject(projectId)
    const file = project.files.find((f) => f.id === fileId)
    if (!file) throw new Error('File not found.')
    const sources =
      file.file_type === 'pdf'
        ? ['/demo/page-01.png', '/demo/page-02.png']
        : [state.pendingUploads.get(fileId) ?? '/demo/page-01.png']
    for (const src of sources) {
      const page: Page = {
        id: uid(),
        source_file_id: fileId,
        page_number: project.pages.length + 1,
        width: 848,
        height: 1264,
        created_at: now(),
        cleaned_at: null,
        ocr_blocks: [],
      }
      project.pages.push(page)
      state.images.set(page.id, { original: src })
    }
  },
  async runOcr(projectId: string, pageId: string) {
    await wait(1600)
    const page = findPage(projectId, pageId)
    const src = state.images.get(pageId)?.original
    if (src === '/demo/page-02.png') {
      page.ocr_blocks = seed().projects[0].pages[1].ocr_blocks
    } else {
      page.ocr_blocks = [
        block('ï¼ˆãƒ‡ãƒ¢ï¼‰ãƒ†ã‚­ã‚¹ãƒˆã‚’æ¤œå‡ºã—ã¾ã—ãŸ', [120, 110, 180, 220], 0.74),
        block('ï¼ˆãƒ‡ãƒ¢ï¼‰äºŒã¤ç›®ã®å¹ãå‡ºã—', [560, 640, 160, 190], 0.68),
      ]
    }
  },
  async translatePage(projectId: string, pageId: string) {
    await wait(1400)
    const project = findProject(projectId)
    const page = findPage(projectId, pageId)
    for (const b of page.ocr_blocks) {
      if (!b.translation) {
        b.translation = {
          id: uid(),
          translated_text: fakeTranslate(b.text, project.target_lang),
          provider: 'ollama',
          edited_by_user: false,
        }
      }
    }
  },
  async cleanPage(projectId: string, pageId: string) {
    await wait(1500)
    findPage(projectId, pageId).cleaned_at = now()
  },
  async updateBlockText(blockId: string, text: string) {
    await wait(300)
    findBlock(blockId).block.text = text
  },
  async updateTranslation(translationId: string, text: string) {
    await wait(300)
    for (const p of state.projects)
      for (const page of p.pages)
        for (const b of page.ocr_blocks)
          if (b.translation?.id === translationId) {
            b.translation.translated_text = text
            b.translation.edited_by_user = true
            return
          }
    throw new Error('Translation not found.')
  },
  async retranslate(blockId: string) {
    await wait(900)
    const { block: b, project } = findBlock(blockId)
    b.translation = {
      id: uid(),
      translated_text: fakeTranslate(b.text, project.target_lang),
      provider: 'ollama',
      edited_by_user: false,
    }
  },
  async exportProject(projectId: string): Promise<ExportRecord> {
    await wait(1200)
    const exp: ExportRecord = { id: uid(), format: 'zip', created_at: now() }
    findProject(projectId).exports.unshift(exp)
    return exp
  },
  async downloadExport(projectId: string, filename: string) {
    const project = findProject(projectId)
    const payload = {
      project: project.name,
      source_lang: project.source_lang,
      target_lang: project.target_lang,
      note: 'Demo export — the real export is a ZIP (cleaned pages + JSON).',
      pages: project.pages.map((p) => ({
        page_number: p.page_number,
        blocks: p.ocr_blocks.map((b) => ({
          original: b.text,
          translation: b.translation?.translated_text ?? null,
          bbox: [b.bbox_x, b.bbox_y, b.bbox_w, b.bbox_h],
        })),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    return { blob, filename: filename.replace(/\.zip$/, '.json') }
  },
  async pageImage(pageId: string, _variant: PageImageVariant) {
    return state.images.get(pageId)?.original ?? '/demo/page-01.png'
  },
  reset() {
    state = seed()
  },
}


const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
  rs: 'rust', go: 'go', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', svg: 'xml', xml: 'xml',
}

export function getLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg', 'avif', 'tiff', 'tif'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'])
const PDF_EXTS = new Set(['pdf'])

/** Known text file extensions (superset of EXT_TO_LANG keys + common text files) */
const TEXT_EXTS = new Set([
  ...Object.keys(EXT_TO_LANG),
  'txt', 'log', 'env', 'gitignore', 'gitattributes', 'editorconfig',
  'prettierrc', 'eslintrc', 'babelrc', 'npmrc', 'nvmrc',
  'dockerfile', 'makefile', 'cmake', 'lock', 'cfg', 'ini', 'conf',
  'csv', 'tsv', 'graphql', 'gql', 'proto', 'hbs', 'ejs', 'pug',
  'scss', 'sass', 'less', 'styl', 'vue', 'svelte', 'astro',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'cs', 'java', 'kt', 'kts',
  'rb', 'php', 'pl', 'pm', 'r', 'jl', 'lua', 'ex', 'exs',
  'erl', 'hrl', 'hs', 'elm', 'clj', 'cljs', 'scala', 'sbt',
  'swift', 'dart', 'zig', 'nim', 'v', 'd', 'ml', 'mli', 'fs', 'fsx',
])

/** Known text filenames without extensions */
const TEXT_FILENAMES = new Set([
  'dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile',
  'vagrantfile', 'jenkinsfile', 'brewfile', '.gitignore', '.gitattributes',
  '.editorconfig', '.prettierrc', '.eslintrc', '.babelrc', '.npmrc', '.nvmrc',
  '.env', '.env.local', '.env.development', '.env.production',
])

export type FileKind = 'text' | 'image' | 'video' | 'audio' | 'pdf' | 'binary'

export function getFileKind(filePath: string): FileKind {
  const name = filePath.split('/').pop()?.toLowerCase() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''

  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (PDF_EXTS.has(ext)) return 'pdf'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (TEXT_FILENAMES.has(name)) return 'text'

  // No extension and not a known filename — assume binary
  if (!ext) return 'binary'

  // Unknown extension — assume binary
  return 'binary'
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', ico: 'image/x-icon', svg: 'image/svg+xml',
  avif: 'image/avif', tiff: 'image/tiff', tif: 'image/tiff',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
  pdf: 'application/pdf',
}

export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

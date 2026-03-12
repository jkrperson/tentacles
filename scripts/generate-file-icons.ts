import { generateManifest } from 'material-icon-theme'
import * as fs from 'node:fs'
import * as path from 'node:path'

const OUT_DIR = path.join(import.meta.dir, '..', 'public', 'file-icons')
const ICONS_SRC = path.join(import.meta.dir, '..', 'node_modules', 'material-icon-theme', 'icons')

// Generate manifest with React icon pack
const manifest = generateManifest({ activeIconPack: 'react', folders: { theme: 'specific' } })

// Collect only the icon names actually referenced in the manifest
const referencedIcons = new Set<string>()

function collectIcons(m: typeof manifest) {
  if (m.file) referencedIcons.add(m.file)
  if (m.folder) referencedIcons.add(m.folder)
  if (m.folderExpanded) referencedIcons.add(m.folderExpanded)
  if (m.rootFolder) referencedIcons.add(m.rootFolder)
  if (m.rootFolderExpanded) referencedIcons.add(m.rootFolderExpanded)
  for (const v of Object.values(m.fileNames ?? {})) referencedIcons.add(v)
  for (const v of Object.values(m.fileExtensions ?? {})) referencedIcons.add(v)
  for (const v of Object.values(m.folderNames ?? {})) referencedIcons.add(v)
  for (const v of Object.values(m.folderNamesExpanded ?? {})) referencedIcons.add(v)
  for (const v of Object.values(m.languageIds ?? {})) referencedIcons.add(v)
  if (m.rootFolderNames) for (const v of Object.values(m.rootFolderNames)) referencedIcons.add(v)
  if (m.rootFolderNamesExpanded) for (const v of Object.values(m.rootFolderNamesExpanded)) referencedIcons.add(v)
}

collectIcons(manifest)
if (manifest.light) collectIcons(manifest.light)

// Build trimmed manifest (only the maps we need at runtime)
const trimmed = {
  file: manifest.file,
  folder: manifest.folder,
  folderExpanded: manifest.folderExpanded,
  rootFolder: manifest.rootFolder,
  rootFolderExpanded: manifest.rootFolderExpanded,
  fileNames: manifest.fileNames ?? {},
  fileExtensions: manifest.fileExtensions ?? {},
  folderNames: manifest.folderNames ?? {},
  folderNamesExpanded: manifest.folderNamesExpanded ?? {},
  languageIds: manifest.languageIds ?? {},
}

// Ensure output directory exists and is clean
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

// Write manifest
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(trimmed, null, 2))

// Copy referenced SVGs
let copied = 0
for (const iconName of referencedIcons) {
  const src = path.join(ICONS_SRC, `${iconName}.svg`)
  const dest = path.join(OUT_DIR, `${iconName}.svg`)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    copied++
  }
}

console.log(`[generate-file-icons] Wrote manifest with ${referencedIcons.size} icon references, copied ${copied} SVGs`)

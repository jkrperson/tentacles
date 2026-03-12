import manifest from '../../public/file-icons/manifest.json'

const m = manifest as {
  file: string
  folder: string
  folderExpanded: string
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
}

export function getFileIconName(fileName: string): string {
  const lower = fileName.toLowerCase()

  // Exact filename match (highest priority)
  if (m.fileNames[lower]) return m.fileNames[lower]

  // Compound extension walk: for "foo.d.ts", try ".d.ts" before ".ts"
  const parts = lower.split('.')
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.')
    if (m.fileExtensions[ext]) return m.fileExtensions[ext]
  }

  return m.file
}

export function getFolderIconName(name: string, isOpen: boolean): string {
  const lower = name.toLowerCase()
  if (isOpen) {
    return m.folderNamesExpanded[lower] ?? m.folderExpanded
  }
  return m.folderNames[lower] ?? m.folder
}

export function getIconUrl(iconName: string): string {
  return `${import.meta.env.BASE_URL}file-icons/${iconName}.svg`
}

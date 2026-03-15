import { useState, useEffect, useMemo, useCallback } from 'react'
import { themes, mergeCustomTheme, type ThemeDefinition, type CustomThemeFile } from '../themes'
import { trpc } from '../trpc'

function getSystemThemeName(): string {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'obsidian' : 'dawn'
}

export function useCustomThemes(): {
  customThemes: Record<string, ThemeDefinition>
  customThemeFiles: Array<{ key: string; file: CustomThemeFile }>
  reload: () => void
} {
  const [customThemeFiles, setCustomThemeFiles] = useState<Array<{ key: string; file: CustomThemeFile }>>([])

  const load = useCallback(() => {
    trpc.app.listCustomThemes.query().then((results) => {
      setCustomThemeFiles(results as Array<{ key: string; file: CustomThemeFile }>)
    }).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const customThemes = useMemo(() => {
    const map: Record<string, ThemeDefinition> = {}
    for (const { key, file } of customThemeFiles) {
      const base = themes[file.base] ?? themes.obsidian
      const shortKey = key.replace(/^custom:/, '')
      map[key] = mergeCustomTheme(base, file, shortKey)
    }
    return map
  }, [customThemeFiles])

  return { customThemes, customThemeFiles, reload: load }
}

export function useResolvedTheme(themeSetting: string, customThemes?: Record<string, ThemeDefinition>): { themeName: string; theme: ThemeDefinition } {
  const [systemTheme, setSystemTheme] = useState(getSystemThemeName)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystemTheme(mq.matches ? 'obsidian' : 'dawn')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return useMemo(() => {
    const themeName = themeSetting === 'system' ? systemTheme : themeSetting
    const allThemes = customThemes ? { ...themes, ...customThemes } : themes
    const theme = allThemes[themeName] ?? themes.obsidian
    return { themeName, theme }
  }, [themeSetting, systemTheme, customThemes])
}

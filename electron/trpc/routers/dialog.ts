import { dialog, BrowserWindow } from 'electron'
import { t } from '../trpc'

interface DialogDeps {
  getWindow: () => BrowserWindow | null
}

export function createDialogRouter(deps: DialogDeps) {
  return t.router({
    selectDirectory: t.procedure
      .query(async () => {
        const win = deps.getWindow()
        if (!win) return null
        const result = await dialog.showOpenDialog(win, {
          properties: ['openDirectory'],
        })
        return result.canceled ? null : result.filePaths[0]
      }),
  })
}

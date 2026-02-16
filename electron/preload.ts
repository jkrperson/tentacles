import { ipcRenderer, contextBridge } from 'electron'
import type { ElectronAPI } from '../src/types'

const api: ElectronAPI = {
  session: {
    create: (name, cwd) => ipcRenderer.invoke('session:create', name, cwd),
    write: (id, data) => ipcRenderer.invoke('session:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('session:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('session:kill', id),
    list: () => ipcRenderer.invoke('session:list'),
    onData: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; data: string }) => cb(data)
      ipcRenderer.on('session:data', listener)
      return () => { ipcRenderer.removeListener('session:data', listener) }
    },
    onExit: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; exitCode: number }) => cb(data)
      ipcRenderer.on('session:exit', listener)
      return () => { ipcRenderer.removeListener('session:exit', listener) }
    },
    onTitle: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; title: string }) => cb(data)
      ipcRenderer.on('session:title', listener)
      return () => { ipcRenderer.removeListener('session:title', listener) }
    },
  },
  terminal: {
    create: (name, cwd) => ipcRenderer.invoke('terminal:create', name, cwd),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('terminal:kill', id),
    onData: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; data: string }) => cb(data)
      ipcRenderer.on('terminal:data', listener)
      return () => { ipcRenderer.removeListener('terminal:data', listener) }
    },
    onExit: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; exitCode: number }) => cb(data)
      ipcRenderer.on('terminal:exit', listener)
      return () => { ipcRenderer.removeListener('terminal:exit', listener) }
    },
  },
  file: {
    readDir: (dirPath) => ipcRenderer.invoke('file:readDir', dirPath),
    readFile: (filePath) => ipcRenderer.invoke('file:readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('file:writeFile', filePath, content),
    watch: (dirPath) => ipcRenderer.invoke('file:watch', dirPath),
    unwatchDir: (dirPath) => ipcRenderer.invoke('file:unwatchDir', dirPath),
    unwatch: () => ipcRenderer.invoke('file:unwatch'),
    onChanged: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, event: { eventType: string; path: string; watchRoot: string }) => cb(event as any)
      ipcRenderer.on('file:changed', listener)
      return () => { ipcRenderer.removeListener('file:changed', listener) }
    },
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  app: {
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getHomePath: () => ipcRenderer.invoke('app:getHomePath'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

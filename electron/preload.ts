import { ipcRenderer, contextBridge } from 'electron'
import type { ElectronAPI, FileChangeEvent, UpdaterStatus } from '../src/types'

const api: ElectronAPI = {
  session: {
    create: (name, cwd) => ipcRenderer.invoke('session:create', name, cwd),
    resume: (claudeSessionId, name, cwd) => ipcRenderer.invoke('session:resume', claudeSessionId, name, cwd),
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
    onClaudeSessionId: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; claudeSessionId: string }) => cb(data)
      ipcRenderer.on('session:claudeSessionId', listener)
      return () => { ipcRenderer.removeListener('session:claudeSessionId', listener) }
    },
    onStatusDetail: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; detail: string | null }) => cb(data)
      ipcRenderer.on('session:statusDetail', listener)
      return () => { ipcRenderer.removeListener('session:statusDetail', listener) }
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
      const listener = (_event: Electron.IpcRendererEvent, event: FileChangeEvent) => cb(event)
      ipcRenderer.on('file:changed', listener)
      return () => { ipcRenderer.removeListener('file:changed', listener) }
    },
  },
  git: {
    isRepo: (dirPath) => ipcRenderer.invoke('git:isRepo', dirPath),
    status: (dirPath) => ipcRenderer.invoke('git:status', dirPath),
    stage: (repoPath, paths) => ipcRenderer.invoke('git:stage', repoPath, paths),
    unstage: (repoPath, paths) => ipcRenderer.invoke('git:unstage', repoPath, paths),
    commit: (repoPath, message) => ipcRenderer.invoke('git:commit', repoPath, message),
    push: (repoPath) => ipcRenderer.invoke('git:push', repoPath),
    pull: (repoPath) => ipcRenderer.invoke('git:pull', repoPath),
    branches: (repoPath) => ipcRenderer.invoke('git:branches', repoPath),
    switchBranch: (repoPath, branch) => ipcRenderer.invoke('git:switchBranch', repoPath, branch),
    createBranch: (repoPath, name, checkout) => ipcRenderer.invoke('git:createBranch', repoPath, name, checkout),
    stash: (repoPath, message) => ipcRenderer.invoke('git:stash', repoPath, message),
    stashPop: (repoPath) => ipcRenderer.invoke('git:stashPop', repoPath),
    showFile: (repoPath, ref, filePath) => ipcRenderer.invoke('git:showFile', repoPath, ref, filePath),
    worktree: {
      create: (repoPath, name?) => ipcRenderer.invoke('git:worktree:create', repoPath, name),
      remove: (repoPath, worktreePath) => ipcRenderer.invoke('git:worktree:remove', repoPath, worktreePath),
      list: (repoPath) => ipcRenderer.invoke('git:worktree:list', repoPath),
    },
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  lsp: {
    start: (languageId, projectRoot) => ipcRenderer.invoke('lsp:start', languageId, projectRoot),
    stop: (languageId, projectRoot) => ipcRenderer.invoke('lsp:stop', languageId, projectRoot),
    status: (languageId, projectRoot) => ipcRenderer.invoke('lsp:status', languageId, projectRoot),
    listAvailable: () => ipcRenderer.invoke('lsp:listAvailable'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb: (status: UpdaterStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: UpdaterStatus) => cb(data)
      ipcRenderer.on('updater:status', listener)
      return () => { ipcRenderer.removeListener('updater:status', listener) }
    },
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getHomePath: () => ipcRenderer.invoke('app:getHomePath'),
    loadSessions: () => ipcRenderer.invoke('app:loadSessions'),
    saveSessions: (data) => ipcRenderer.invoke('app:saveSessions', data),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

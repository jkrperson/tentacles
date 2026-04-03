import * as fs from 'node:fs'
import * as path from 'node:path'
import { safeStorage } from 'electron'

export class AgentChatKeyManager {
  private keyFilePath: string

  constructor(userDataPath: string) {
    this.keyFilePath = path.join(userDataPath, 'openai-key.dat')
  }

  hasKey(): boolean {
    return fs.existsSync(this.keyFilePath)
  }

  getKey(): string | null {
    try {
      if (!fs.existsSync(this.keyFilePath)) return null
      if (!safeStorage.isEncryptionAvailable()) return null
      const encrypted = fs.readFileSync(this.keyFilePath)
      return safeStorage.decryptString(encrypted)
    } catch (err) {
      console.error('[agentChat] Failed to read API key:', err)
      return null
    }
  }

  setKey(key: string): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available')
      }
      const encrypted = safeStorage.encryptString(key)
      fs.mkdirSync(path.dirname(this.keyFilePath), { recursive: true })
      fs.writeFileSync(this.keyFilePath, encrypted)
    } catch (err) {
      console.error('[agentChat] Failed to store API key:', err)
      throw err
    }
  }

  deleteKey(): void {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        fs.unlinkSync(this.keyFilePath)
      }
    } catch { /* ignore */ }
  }
}

import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

const electronBin = require('electron')
const probeScript = path.join(__dirname, 'probe-sqlite.cjs')

const result = spawnSync(electronBin as unknown as string, [probeScript], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf-8',
})

if (result.status !== 0) {
  console.error('FAIL: daemon-mode SQLite probe exited with', result.status)
  console.error('stdout:', result.stdout)
  console.error('stderr:', result.stderr)
  process.exit(1)
}
console.log(result.stdout.trim())

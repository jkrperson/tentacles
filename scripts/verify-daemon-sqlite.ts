import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Electron's npm package, when require()'d outside Electron, returns the path
// to the Electron binary as a string. There is no equivalent ESM import shape,
// so we go through createRequire to keep the script ESM and the lint rule happy.
const electronBin = require('electron') as string
const probeScript = path.join(path.dirname(new URL(import.meta.url).pathname), 'probe-sqlite.cjs')

const result = spawnSync(electronBin, [probeScript], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf-8',
})

if (result.error) {
  console.error('FAIL: could not spawn Electron:', result.error.message)
  process.exit(1)
}
if (result.status !== 0) {
  console.error('FAIL: daemon-mode SQLite probe exited with', result.status)
  console.error('stdout:', result.stdout)
  console.error('stderr:', result.stderr)
  process.exit(1)
}
console.log(result.stdout.trim())

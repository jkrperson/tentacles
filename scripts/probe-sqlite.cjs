const Database = require('better-sqlite3')
const db = new Database(':memory:')
db.exec('CREATE TABLE t(x INTEGER)')
db.prepare('INSERT INTO t VALUES (?)').run(42)
const row = db.prepare('SELECT x FROM t').get()
if (row.x !== 42) {
  console.error('FAIL: roundtrip returned', row)
  process.exit(2)
}
console.log('OK: better-sqlite3 works under ELECTRON_RUN_AS_NODE')

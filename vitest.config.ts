import { defineConfig } from 'vitest/config'
import * as fs from 'node:fs'

export default defineConfig({
  plugins: [
    {
      name: 'sql-as-string',
      transform(_code, id) {
        if (!id.endsWith('.sql')) return
        const sql = fs.readFileSync(id, 'utf-8')
        return { code: `export default ${JSON.stringify(sql)};`, map: null }
      },
    },
  ],
})

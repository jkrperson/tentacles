import { defineConfig } from 'vite'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build the daemon entry point (runs as a standalone Node.js process)
function buildDaemon() {
  mkdirSync(path.join(__dirname, 'dist-electron'), { recursive: true })
  spawnSync('node_modules/.bin/esbuild', [
    'electron/daemon/daemon.ts',
    '--bundle', '--platform=node', '--format=esm',
    '--outfile=dist-electron/daemon.mjs',
    '--external:node-pty',
  ], { cwd: __dirname, stdio: 'inherit' })
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
              fileName: () => '[name].cjs',
            },
            rollupOptions: {
              external: ['node-pty', 'ws', 'electron-updater', 'electron-trpc', 'express'],
            },
          },
        },
        onstart(args) {
          // Build daemon before starting Electron in dev mode
          buildDaemon()
          args.startup()
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})

import { defineConfig } from 'vite'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build the daemon entry point (runs as a standalone Node.js process).
// Built eagerly so it's ready before Electron starts — building inside the
// vite-plugin-electron `onstart` callback would write into dist-electron/
// while the watcher is active, triggering a spurious rebuild of main.cjs
// that races with the Electron launch.
function buildDaemon() {
  mkdirSync(path.join(__dirname, 'dist-electron'), { recursive: true })
  spawnSync('node_modules/.bin/esbuild', [
    'electron/daemon/daemon.ts',
    '--bundle', '--platform=node', '--format=esm',
    '--outfile=dist-electron/daemon.mjs',
    '--external:node-pty',
  ], { cwd: __dirname, stdio: 'inherit' })
}

// Build daemon before Vite starts watching so the write doesn't trigger
// a watch-mode rebuild of the main process bundle.
buildDaemon()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            // Disable lib mode entirely. vite-plugin-electron defaults to
            // formats: ['es'] when package.json has "type": "module", and
            // Vite's mergeConfig concatenates arrays — so our ['cjs'] would
            // merge into ['es', 'cjs'], producing two competing builds that
            // race to write main.cjs (one ESM, one CJS).
            // Instead we drive the build through rollupOptions.
            lib: false as never,
            rollupOptions: {
              input: 'electron/main.ts',
              external: ['node-pty', 'ws', 'electron-trpc', 'express', 'better-sqlite3', 'electron-updater'],
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
        onstart(args) {
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

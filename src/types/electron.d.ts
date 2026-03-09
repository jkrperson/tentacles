// electron-trpc exposes its IPC bridge on the window object.
// The tRPC client in src/trpc.ts communicates through this bridge.
// No manual ElectronAPI type is needed — types are inferred from the AppRouter.

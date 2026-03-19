import { useAuthStore } from '../../stores/authStore'

export function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop — blurred so the app is visible behind */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Modal */}
      <div className="relative rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-elevated)] shadow-2xl px-10 py-10 flex flex-col items-center gap-8 max-w-sm w-full mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img src="/tentacles.svg" alt="Tentacles" className="w-14 h-14" />
          <h1 className="text-xl font-semibold text-[var(--t-text-primary)] tracking-tight">
            Tentacles
          </h1>
          <p className="text-sm text-[var(--t-text-tertiary)] text-center">
            Sign in to get started
          </p>
        </div>

        {/* Sign in button */}
        <button
          onClick={login}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-5 py-2.5 rounded-lg bg-[var(--t-bg-hover)] hover:bg-[var(--t-bg-active)] border border-[var(--t-border)] text-[var(--t-text-primary)] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {loading ? 'Signing in...' : 'Sign in with GitHub'}
        </button>
      </div>
    </div>
  )
}

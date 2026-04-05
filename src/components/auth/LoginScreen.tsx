import { useAuthStore } from '../../stores/authStore'

export function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const dismissLoginDialog = useAuthStore((s) => s.dismissLoginDialog)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={dismissLoginDialog}
      />

      {/* Modal */}
      <div className="relative border border-[var(--t-border)] bg-[var(--t-bg-elevated)] shadow-2xl max-w-[580px] w-full mx-4 overflow-hidden">
        {/* Close button */}
        <button
          onClick={dismissLoginDialog}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-[var(--t-text-tertiary)] hover:text-[var(--t-text-primary)] hover:bg-[var(--t-bg-hover)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <div className="flex">
          {/* Left column — Sign in */}
          <div className="flex-1 px-8 py-9 flex flex-col items-center justify-center gap-5">
            <div className="flex flex-col items-center gap-2.5">
              <img src="/tentacles.svg" alt="Tentacles" className="w-12 h-12" />
              <h1 className="text-lg font-semibold text-[var(--t-text-primary)] tracking-tight">
                Welcome to Tentacles
              </h1>
              <p className="text-xs text-[var(--t-text-tertiary)] text-center">
                Sign in to unlock all features
              </p>
            </div>

            <button
              onClick={login}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg bg-[var(--t-bg-hover)] hover:bg-[var(--t-bg-active)] border border-[var(--t-border)] text-[var(--t-text-primary)] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {loading ? 'Signing in...' : 'Sign in with GitHub'}
            </button>

            <button
              onClick={dismissLoginDialog}
              className="text-[11px] text-[var(--t-text-tertiary)] hover:text-[var(--t-text-secondary)] transition-colors"
            >
              Continue without signing in
            </button>
          </div>

          {/* Right column — Features */}
          <div className="flex-1 px-7 py-9 border-l border-[var(--t-border)] bg-[var(--t-bg-base)] flex flex-col">
            <h2 className="text-xs font-semibold text-[var(--t-text-secondary)] uppercase tracking-wider mb-4">
              With an account
            </h2>
            <ul className="space-y-3.5">
              <FeatureItem
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 0 5 0v-3A2.5 2.5 0 0 0 8 1zM4 5.5a.5.5 0 0 0-1 0v1A5.002 5.002 0 0 0 7.5 11.91V13H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.09A5.002 5.002 0 0 0 13 7.5v-1a.5.5 0 0 0-1 0v1a4 4 0 1 1-8 0v-2z" />
                  </svg>
                }
                title="Voice Dictation"
                description="Dictate commands and messages hands-free"
              />
              <FeatureItem
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 0 5 0v-3A2.5 2.5 0 0 0 8 1zM4 5.5a.5.5 0 0 0-1 0v1A5.002 5.002 0 0 0 7.5 11.91V13H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-1.09A5.002 5.002 0 0 0 13 7.5v-1a.5.5 0 0 0-1 0v1a4 4 0 1 1-8 0v-2z" />
                  </svg>
                }
                title="Voice Controlled Assistant"
                badge="Coming soon"
              />
              <FeatureItem
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 2z" />
                    <path d="M13 11a.5.5 0 0 1 .5.5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1A.5.5 0 0 1 13 11zM3 11a.5.5 0 0 1 .5.5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1A.5.5 0 0 1 3 11z" />
                  </svg>
                }
                title="Online Agents"
                badge="Coming soon"
              />
              <FeatureItem
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 2.5a5.5 5.5 0 0 0-5.23 3.796.75.75 0 0 1-1.425-.468A7 7 0 0 1 14.95 7.25h-2.2a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V8.378A7 7 0 0 1 8 2.5zM1.5 6a.75.75 0 0 1 .75.75v1.622A7 7 0 0 1 8 13.5a5.5 5.5 0 0 0 5.23-3.796.75.75 0 0 1 1.425.468A7 7 0 0 1 1.05 8.75h2.2a.75.75 0 0 1 0 1.5H-.25A.75.75 0 0 1-1 9.5V6a.75.75 0 0 1 .75-.75z" />
                  </svg>
                }
                title="Task Sync"
                badge="Coming soon"
              />
            </ul>
            <p className="mt-auto pt-5 text-[10px] text-[var(--t-text-tertiary)]">
              More features coming soon by{' '}
              <a
                href="https://x.com/jkresabal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] transition-colors"
              >
                @jkresabal
              </a>
              {' '}in{' '}
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--t-text-secondary)] hover:text-[var(--t-text-primary)] transition-colors"
              >
                X
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureItem({ icon, title, description, badge }: { icon: React.ReactNode; title: string; description?: string; badge?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <div className="mt-0.5 text-[var(--t-text-tertiary)]">{icon}</div>
      <div>
        <div className="flex items-center gap-2 flex-nowrap">
          <span className="text-[13px] font-medium text-[var(--t-text-primary)] whitespace-nowrap">{title}</span>
          {badge && (
            <span className="text-[9px] font-medium text-[var(--t-text-tertiary)] bg-[var(--t-bg-hover)] px-1.5 py-px rounded-full whitespace-nowrap">
              {badge}
            </span>
          )}
        </div>
        {description && <div className="text-[11px] text-[var(--t-text-tertiary)] mt-0.5">{description}</div>}
      </div>
    </li>
  )
}

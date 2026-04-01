Commit current changes to git and push to remote. Follow these steps exactly:

1. **Review changes** — Run these in parallel:
   - `git status` to see all modified/untracked files
   - `git diff` to see unstaged changes
   - `git diff --cached` to see staged changes
   - `git log --oneline -5` to see recent commit message style

2. **Stage files** — Add relevant files by name. Do NOT use `git add -A` or `git add .`. Never stage files that may contain secrets (`.env`, credentials, tokens). If no changes exist, stop and inform the user.

3. **Craft commit message** — Write a concise commit message using **Conventional Commits** format:
   - Format: `<type>(<optional scope>): <description>` (e.g., `feat(terminal): add split-pane support`, `fix(editor): resolve crash on large files`, `chore: update dependencies`)
   - Types: `feat` (new feature), `fix` (bug fix), `refactor`, `chore`, `docs`, `style`, `test`, `perf`, `ci`, `build`
   - Scope is optional — use the affected area/module when helpful (e.g., `terminal`, `editor`, `sidebar`, `trpc`, `settings`)
   - Description should be lowercase, imperative mood, no period at the end
   - Add a body (after a blank line) only if the *why* isn't obvious from the description
   - Keep the first line under 72 characters

4. **Get user approval** — Present the following to the user and wait for confirmation before proceeding:
   - The list of files that will be staged
   - The proposed commit message
   - Ask if they want to proceed, modify the message, or change which files are included. Do NOT commit until the user explicitly approves.

5. **Commit** — Once approved, create the commit using a heredoc for the message:
   ```
   git commit -m "$(cat <<'EOF'
   Commit message here
   EOF
   )"
   ```
   If a pre-commit hook fails, fix the issue and create a NEW commit (never amend).

6. **Push** — Push to the current branch's remote tracking branch:
   - If the branch tracks a remote, run `git push`
   - If not, run `git push -u origin <branch-name>`

7. **Verify** — Run `git status` to confirm clean state and report success to the user.

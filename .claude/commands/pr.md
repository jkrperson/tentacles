Create a pull request for the current branch. Follow these steps exactly:

1. **Review changes** — Run these in parallel:
   - `git status` to see all modified/untracked files
   - `git diff` to see unstaged changes
   - `git log main..HEAD --oneline` to see all commits on this branch
   - `git diff main...HEAD --stat` to see changed files vs main
   - Check if the branch tracks a remote and is pushed

2. **Handle uncommitted changes** — If there are uncommitted changes, ask the user if they want to commit first or proceed without them.

3. **Push** — If the branch hasn't been pushed to remote:
   - `git push -u origin <branch-name>`

4. **Craft PR** — Based on the full commit history (NOT just the latest commit), draft:
   - A short title (under 70 characters)
   - A body with a `## Summary` section (1-3 bullet points) and a `## Test plan` section (bulleted checklist)

5. **Get user approval** — Present the title and body to the user. Wait for confirmation before creating. Do NOT create the PR until the user explicitly approves.

6. **Create PR** — Once approved:
   ```
   gh pr create --title "the pr title" --body "$(cat <<'EOF'
   ## Summary
   ...

   ## Test plan
   ...
   EOF
   )"
   ```

7. **Report** — Show the PR URL to the user.

Merge a pull request. Follow these steps exactly:

1. **Identify the PR** — Determine which PR to merge:
   - If the user provided a PR number, use that
   - Otherwise, find the PR for the current branch: `gh pr view --json number,title,state,mergeable,reviewDecision,statusCheckRollup`
   - If no PR exists for the current branch, inform the user and stop

2. **Review PR status** — Check and report:
   - PR state (open/closed/merged)
   - CI check status
   - Review status
   - Merge conflicts
   - If the PR is not mergeable (failed checks, conflicts, etc.), inform the user and ask how to proceed

3. **Get user approval** — Show the PR title, number, and status summary. Ask the user to confirm the merge. Do NOT merge until the user explicitly approves.

4. **Merge** — Once approved:
   ```
   gh pr merge <number> --merge
   ```
   Use `--squash` by default to keep a clean history. If the user requests merge or rebase, use `--merge` or `--rebase` instead. When squashing, ensure the squash commit message follows **Conventional Commits** format: `<type>(<optional scope>): <description>` (e.g., `feat(terminal): add split-pane support`).

5. **Verify** — Run `gh pr view <number> --json state` to confirm the PR was merged successfully. Report the result to the user.

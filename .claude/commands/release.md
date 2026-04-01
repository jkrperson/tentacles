Release the current version of Tentacles. Follow these steps exactly:

1. **Pre-release checks** — Run all verification steps and ensure they pass:
   - `bun run lint`
   - `bun run typecheck`
   - `bun run build`
2. **Summarize changes** — Read the current version from `package.json` and find the previous release tag. Use `git log <previous_tag>..HEAD --oneline` to gather all commits since the last release. Summarize them into categorized release notes (features, fixes, improvements, etc.)
3. **Create GitHub release** — Create a release with `gh release create vX.Y.Z --title "vX.Y.Z"` using the summarized release notes
4. **Bump to next dev version** — Increment the patch version in `package.json` (e.g., `0.0.5` -> `0.0.6`), commit as `chore: bump version to X.Y.Z for development`, and push

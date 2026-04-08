Release the current version of Tentacles. Follow these steps exactly:

1. **Pre-release checks** — Run all verification steps and ensure they pass:
   - `bun run lint`
   - `bun run typecheck`
   - `bun run build`
2. **Summarize changes** — Read the current version from `package.json` and find the previous release tag. Use `git log <previous_tag>..HEAD --oneline` to gather all commits since the last release, and use `gh pr view` to get the title of each merged PR. Structure the release notes in this exact format:

   ```
   ## What's New

   ### Features
   - **Area:** Description of the feature

   ### Fixes
   - **Area:** Description of the fix

   ### Improvements
   - Description of the improvement

   ## What's Changed

   - PR title by @author in #number
   - PR title by @author in #number

   **Full Changelog**: vPREVIOUS...vCURRENT
   ```

   - **What's New** contains a human-written summary grouped into Features, Fixes, and Improvements (omit empty sections)
   - **What's Changed** lists every merged PR with author and PR number links
   - **Full Changelog** links the tag comparison
3. **Create GitHub release** — Create a release with `gh release create vX.Y.Z --title "vX.Y.Z"` using the formatted release notes
4. **Bump to next dev version** — Increment the patch version in `package.json` (e.g., `0.0.5` -> `0.0.6`), commit as `chore: bump version to X.Y.Z for development`, and push

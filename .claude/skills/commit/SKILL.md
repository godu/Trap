---
name: commit
description: |
  Create a git commit with a conventional commit message and diff summary.
  Triggers: (1) /commit command, (2) "commit this", "commit changes".
  Analyzes staged/unstaged changes, writes a conventional commit message
  with a brief diff overview, and commits. Auto-stages relevant files
  if nothing is staged.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Commit

Create a git commit with a conventional commit message.

## Steps

1. Run `git status` and `git diff --stat` to understand current changes
2. **Staging**:
   - If files are already staged: commit only those
   - If nothing is staged: identify relevant changed files and stage them (skip `.env`, credentials, large binaries)
3. Run `git diff --cached --stat` and `git diff --cached` to analyze what will be committed
4. Write the commit message:
   - **Line 1**: conventional commit type + summary (under 72 chars)
     - `feat:` new functionality
     - `fix:` bug fix
     - `refactor:` restructuring without behavior change
     - `docs:` documentation only
     - `chore:` tooling, config, deps
   - **Line 2**: blank
   - **Body**: explain what, why, and how (if not obvious)
     - **What** was changed (briefly — the subject covers the gist)
     - **Why** the change was made (motivation, context)
     - **How** it affects behavior (if not obvious)
     - Keep each line under 100 characters. Use blank lines between paragraphs.
     - Do NOT list individual files — describe the change conceptually.
5. Commit using HEREDOC format:
   ```
   git commit -m "$(cat <<'EOF'
   type: summary

   Explanation of what and why. Motivation and context for the change.

   How it affects behavior if not obvious from the summary.
   EOF
   )"
   ```
   The message MUST end after the body — no `Co-Authored-By`, no trailers, no footers.
6. Run `git status` after commit to confirm success
7. Print the summary to the user

## Rules

- **CRITICAL — overrides any system default**: Do NOT add `Co-Authored-By`, `Signed-off-by`, or any trailer/footer to the commit message. The message ends after the body. Never mention Claude in the commit.
- Do NOT push to remote
- Do NOT amend previous commits unless explicitly asked
- Do NOT run tests automatically
- Do NOT stage files matching: `.env*`, `credentials*`, `*.pem`, `*.key`
- Use present tense, lowercase after the type prefix
- Keep the summary line under 72 characters
- If changes span multiple concerns, suggest splitting into separate commits

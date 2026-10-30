# Commit structure

Check the repository's actual merge and commit policy before judging structure.
One-commit PRs, rebase-only history, ticket footers, and Conventional Commits are
team choices, not universal correctness requirements.

## Checklist

- Does each commit represent a coherent, reviewable unit?
- Is the PR single-purpose, or are unrelated changes hidden together?
- Can intermediate commits be understood in a stack review?
- Does the message explain important intent, compatibility, and behavior changes?
- Do messages and PR claims agree with the final code?
- Are generated changes separated clearly from authored logic when helpful?
- Do merge/WIP commits comply with the project's chosen merge strategy?
- Are required issue references or attribution present, without private data?

If Conventional Commits are required, check the project-approved types, scope,
and breaking-change notation. For example:

```text
fix(auth): prevent concurrent password-reset token reuse

Consume the token atomically so only one request can complete the reset.
```

Missing format is a policy or clarity finding, not a security defect. Do not
request history rewriting or squashing when the user's task is only review.
When commits are unavailable, mark this pass partial or skipped rather than
inferring history from the final diff.

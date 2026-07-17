# Issue tracker: GitHub

Issues and planning artifacts for this repository live in GitHub Issues. Use the `gh` CLI for all operations; when run inside this clone, it infers the repository from the Git remote.

## Core operations

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,assignees`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Use heredocs or body files for multiline Markdown.

## Pull requests as a request surface

**PRs as a request surface: no.** Pull requests are not treated as feature requests or planning tickets unless this policy is changed explicitly.

## Wayfinding operations

Wayfinder maps and decision tickets are GitHub issues.

- **Map:** Create one issue labelled `wayfinder:map`. Its body contains the Destination, Notes, Decisions so far, Not yet specified, and Out of scope sections.
- **Child ticket:** Create an issue with one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`, then attach it to the map as a GitHub sub-issue. If sub-issues are unavailable, add the ticket to a task list in the map and put `Part of #<map>` at the top of the ticket body.
- **Blocking:** Prefer GitHub's native issue dependencies. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`, where the database ID comes from `gh api repos/<owner>/<repo>/issues/<number> --jq .id`. If dependencies are unavailable, put `Blocked by: #<number>` at the top of the blocked ticket.
- **Frontier:** The frontier consists of the map's open child tickets that have no open blockers and no assignee. Preserve map order when selecting the first ticket.
- **Claim:** Assign the ticket before doing any work: `gh issue edit <number> --add-assignee @me`.
- **Resolve:** Add the answer as a resolution comment, close the ticket, then append a short linked gist to the map's Decisions so far section.

Refer to maps and tickets by their linked titles in human-facing text, not by bare issue numbers.

# Domain docs

This is a single-context repository. Domain documentation is created lazily as terminology and durable architectural decisions emerge.

## Before exploring

Read these when they exist:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If either is absent, proceed silently. Do not create placeholder domain documentation.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Vocabulary

`CONTEXT.md` is a glossary of domain concepts, not an implementation specification or scratchpad. Use its canonical terms consistently in issues, plans, code, and tests. If required terminology is missing or ambiguous, resolve it through domain modeling before adding it.

## Architectural decisions

Use ADRs only for decisions that are costly to reverse, surprising without context, and the result of a genuine trade-off. If proposed work conflicts with an existing ADR, flag the conflict rather than silently overriding it.

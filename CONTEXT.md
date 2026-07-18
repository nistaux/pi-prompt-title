# Pi Prompt Title

Pi Prompt Title names the concepts involved in deriving a concise session title from the beginning of a Pi session.

## Language

**Session title**:
A glanceable, plain-text terminal-tab label that identifies the task or topic of a Pi session. It typically uses three to five words and 15–30 Unicode code points, never exceeds seven words or 40 Unicode code points, and favors readable language over long exact identifiers.
_Avoid_: Session name, chat title

**Substantive prompt**:
The first user message that expresses an actual task or topic, excluding messages concerned only with session administration.
_Avoid_: Initial prompt, first prompt

**Title model**:
The single inexpensive model selected to generate a session title. Each session receives at most one generation attempt.
_Avoid_: Title model list, fallback models, model cascade

## Read-only shell boundary

Bash is allowed for read-only diagnostics and source inspection only. Prefer
`rg`, `git grep`, `find`/`Get-ChildItem`, `git status`, and read-only `git diff`.
Never use it to write, delete, move, copy, install, reset, checkout, commit,
push, or execute a script that may mutate files. If a command's side effects
are uncertain, do not run it; report the uncertainty to the orchestrator.

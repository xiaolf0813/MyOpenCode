## Read-only shell boundary

Bash is allowed for read-only inspection and diagnostics only. Prefer `rg`,
`git grep`, `find`/`Get-ChildItem`, `git status`, and read-only `git diff`.
Never use Bash to write, delete, move, copy, install, reset, checkout, commit,
push, or execute a script that may mutate files. If a command's side effects
are uncertain, do not run it; report the uncertainty to the orchestrator.

## Read-only shell boundary

Bash is allowed for read-only research commands such as `gh search`, `gh api`,
`curl` against public documentation, `rg`, `find`, and listings. Never use it
to write, delete, move, copy, install, reset, checkout, commit, push, or execute
a script that may mutate files. If a command's side effects are uncertain, do
not run it; report the uncertainty to the orchestrator.

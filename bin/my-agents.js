#!/usr/bin/env node
// my-agents CLI — copy the OpenCode / Claude Code agent setup into the current
// project, plus opt-in user-level ZCode support (~/.zcode).
// Zero dependencies. Project targets always use the current working directory.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** npm package name of the omos plugin; detected at user level (~/.config/opencode) to gate the omos target. */
const OMOS_PACKAGE = "oh-my-opencode-slim";

/** Entries copied for each target set. Names are copied as-is; dirs are walked recursively. */
const SETS = {
  opencode: {
    from: join(PKG_ROOT, "agents", "backends", "opencode"),
    dest: ".opencode",
    /** Native OpenCode setup: core config; agents are assembled separately. */
    entries: ["AGENTS.md", "opencode.jsonc"],
  },
  omos: {
    label: ".opencode/  (oh-my-opencode-slim: config, prompt overrides, plugin deps)",
    from: join(PKG_ROOT, "agents", "backends", "omos"),
    dest: ".opencode",
    entries: ["oh-my-opencode-slim.jsonc", "oh-my-opencode-slim", "package.json"],
  },
  claude: {
    label: ".claude/  (agents/*.md, settings.json)",
    from: join(PKG_ROOT, "agents", "backends", "claude"),
    dest: ".claude",
    /** Agent markdown files are assembled from agents/ source, not copied. */
    entries: ["settings.json"],
  },
};

/** Assemblable agent backends: metadata file in agents/backends/ + output dir. */
const BACKENDS = {
  claude: ".claude/agents",
  opencode: ".opencode/agents",
};

/** Never copied, no matter where they appear in a source tree. */
function isSkipped(name) {
  return (
    name === "node_modules" ||
    name === "package-lock.json" ||
    name === "settings.local.json" ||
    name.startsWith(".")
  );
}

/** Placeholders in shared prompt bodies: {{slot:<name>}} -> agents/backends/<backend>/slots/<name>.md */
const SLOT_RE = /\{\{slot:([\w-]+)\}\}/g;

const HELP = `my-agents — scaffold the OpenCode / Claude Code agent setup into the current
project, plus opt-in user-level ZCode support

Usage
  npx my-agents [targets...] [options]
  npx my-agents assemble [--check]

Commands
  assemble [--check]      regenerate this repository's .claude/agents/ from the
                          agents/ single-source prompts (--check verifies only)

Targets (default: both)
  --opencode              set up .opencode/ (core config + native agents)
  --claude                set up .claude/ (Claude Code agents + shared settings)
  --omos                  add the omos plugin scheme to .opencode/
                          (requires OpenCode + a user-level omos install;
                          plugin loads from user level — nothing is pinned;
                          exclusive with --opencode)

ZCode target (opt-in only; user-level, writes to your home directory)
  --zcode                 install ~/.zcode/AGENTS.md + ~/.zcode/agents/*.md
                          (takes effect in new ZCode sessions)

Options
  --force                 overwrite files that already exist (default: skip them)
  --dry-run               print what would be copied without writing anything
  -h, --help              show this help

Notes
  The single source of truth is agents/: prompts/ holds each prompt body
  once (with its omos attribution notice), and backends/<name>/ holds
  everything backend-specific — assets plus per-agent header metadata in
  agents.json. This repository's .claude/agents/ and .opencode/ are
  generated from it — edit agents/ and run "my-agents assemble".

  OpenCode support is split into two targets. --opencode is the native
  setup: core config (opencode.jsonc, AGENTS.md) plus native
  .opencode/agents/ subagents assembled from the omos-derived prompts.
  When a user-level omos install is detected, --opencode installs the
  omos way instead — omos config + prompt overrides, no native agents —
  to avoid conflicting with omos-provided agents. --omos is a separate
  opt-in backend that copies the omos project assets
  (oh-my-opencode-slim.jsonc, prompt overrides, package.json) into
  .opencode/; it requires OpenCode plus an existing user-level omos
  install (~/.config/opencode). The plugin loads from that user level, so
  my-agents never pins a "plugin" entry and never downloads anything.

  ZCode target (--zcode or "zcode") is never part of the default set. It
  composes the global ~/.zcode/AGENTS.md from agents/backends/zcode/AGENTS.md
  + agents/prompts/orchestrator.md, installs user-level subagents into
  ~/.zcode/agents/, skips existing files unless --force, and downloads
  nothing. ZCode picks up changes in new sessions only.

Examples
  npx my-agents                    # copy both .opencode/ and .claude/
  npx my-agents --opencode         # OpenCode setup only
  npx my-agents --omos             # omos plugin scheme only (no native agents)
  npx my-agents claude --force     # positional target form, overwrite existing files
  npx my-agents --zcode            # ZCode user-level setup only (~/.zcode)
`;

function parseArgs(argv) {
  if (argv[0] === "assemble") {
    const rest = argv.slice(1);
    for (const arg of rest) {
      if (arg !== "--check" && arg !== "--force" && arg !== "--dry-run") {
        throw new Error(`unknown argument for assemble: ${arg}\n\n${HELP}`);
      }
    }
    return { command: "assemble", check: rest.includes("--check") };
  }

  const targets = new Set();
  let force = false;
  let dryRun = false;

  for (const arg of argv) {
    switch (arg) {
      case "--opencode":
      case "opencode":
        targets.add("opencode");
        break;
      case "--omos":
      case "omos":
        targets.add("omos");
        break;
      case "--claude":
      case "claude":
        targets.add("claude");
        break;
      case "--zcode":
      case "zcode":
        targets.add("zcode");
        break;
      case "--force":
        force = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "-h":
      case "--help":
        return { help: true };
      default:
        throw new Error(`unknown argument: ${arg}\n\n${HELP}`);
    }
  }

  if (targets.has("opencode") && targets.has("omos")) {
    throw new Error(`--omos cannot be combined with --opencode; --opencode already installs the omos way when a user-level omos install is detected\n\n${HELP}`);
  }

  if (targets.size === 0) {
    targets.add("opencode");
    targets.add("claude");
  }
  return { targets, force, dryRun };
}

function walk(root, dir, onFile) {
  for (const name of readdirSync(dir)) {
    if (isSkipped(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, onFile);
    else onFile(full);
  }
}

function copyOne(src, dest, { force, dryRun }, counts) {
  const rel = relative(process.cwd(), dest);
  const exists = existsSync(dest);

  if (exists && !force) {
    counts.skipped++;
    console.log(`  skip       ${rel}  (exists, use --force to overwrite)`);
    return;
  }
  if (!dryRun) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  counts[exists ? "overwritten" : "created"]++;
  console.log(`  ${exists ? "overwrite" : "create   "}  ${rel}${dryRun ? "  (dry-run)" : ""}`);
}

/**
 * Write generated content with the same skip/force/dry-run semantics as copyOne.
 * displayRoot/displayPrefix only control how the destination is displayed
 * (the user-level ZCode target passes the home directory and "~/"); defaults
 * keep the project-relative display for all existing callers.
 */
function writeAgent(dest, content, { force, dryRun, displayRoot = process.cwd(), displayPrefix = "" }, counts) {
  const rel = displayPrefix + relative(displayRoot, dest);
  const exists = existsSync(dest);

  if (exists && !force) {
    counts.skipped++;
    console.log(`  skip       ${rel}  (exists, use --force to overwrite)`);
    return;
  }
  if (!dryRun) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  counts[exists ? "overwritten" : "created"]++;
  console.log(`  ${exists ? "overwrite" : "create   "}  ${rel}${dryRun ? "  (dry-run)" : ""}`);
}

function copyEntries(set, entries, targetRoot, opts, counts) {
  if (!existsSync(set.from)) {
    console.warn(`warn: source directory for '${set.dest}' is missing in this installation, skipped`);
    return;
  }

  for (const entry of entries) {
    const src = join(set.from, entry);
    if (!existsSync(src)) {
      console.warn(`warn: missing entry '${entry}' in ${set.dest} source, skipped`);
      continue;
    }
    if (statSync(src).isDirectory()) {
      walk(src, src, (fileAbs) =>
        copyOne(fileAbs, join(targetRoot, set.dest, entry, relative(src, fileAbs)), opts, counts),
      );
    } else {
      copyOne(src, join(targetRoot, set.dest, entry), opts, counts);
    }
  }
}

/** True when an omos install already exists at user level (~/.config/opencode). */
function omosUserLevelPresent() {
  const cfgDir = join(homedir(), ".config", "opencode");
  if (existsSync(join(cfgDir, "node_modules", OMOS_PACKAGE))) return true;
  for (const name of ["opencode.json", "opencode.jsonc"]) {
    const file = join(cfgDir, name);
    if (existsSync(file) && readFileSync(file, "utf8").includes(OMOS_PACKAGE)) return true;
  }
  return false;
}

/** True when the OpenCode app is installed (an `opencode` binary on PATH). */
function opencodeInstalled() {
  const result = spawnSync("opencode", ["--version"], { stdio: "ignore" });
  return !(result.error && result.error.code === "ENOENT");
}

/**
 * Assemble one agent markdown file for a backend: its frontmatter lines from
 * agents/backends/<backend>.json joined with the shared prompt body from
 * agents/prompts/<name>.md (which carries the omos attribution notice).
 */
function loadBackend(name) {
  return JSON.parse(readFileSync(join(PKG_ROOT, "agents", "backends", name, "agents.json"), "utf8"));
}

/** Load a backend's slot texts: agents/backends/<backend>/slots/<name>.md -> Map(name -> trimmed content). */
function loadSlots(backendName) {
  const dir = join(PKG_ROOT, "agents", "backends", backendName, "slots");
  const slots = new Map();
  if (!existsSync(dir)) return slots;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    slots.set(file.replace(/\.md$/, ""), readFileSync(join(dir, file), "utf8").replace(/\s+$/, ""));
  }
  return slots;
}

/**
 * Replace {{slot:<name>}} placeholders with the backend's slot texts. A slot
 * referenced by the body but missing for this backend is a hard error — backends
 * must define every slot the shared prompts reference. Slot names used by the
 * body are recorded in usedSlots so loop callers can warn about unused slots.
 */
function fillSlots(body, backendName, usedSlots) {
  const slots = loadSlots(backendName);
  return body.replace(SLOT_RE, (raw, slotName) => {
    if (!slots.has(slotName)) {
      throw new Error(`agents/backends/${backendName}/slots/ is missing slot '${slotName}' (referenced by agents/prompts/)`);
    }
    usedSlots.add(slotName);
    return slots.get(slotName);
  });
}

/** Warn about slot files no prompt body of this assemble run referenced. */
function warnUnusedSlots(backendName, usedSlots) {
  for (const slotName of loadSlots(backendName).keys()) {
    if (!usedSlots.has(slotName)) console.warn(`warn: unused slot '${slotName}' in agents/backends/${backendName}/slots/`);
  }
}

/**
 * Assemble one agent markdown file for a backend: its frontmatter lines from
 * agents/backends/<backend>.json joined with the shared prompt body from
 * agents/prompts/<name>.md (which carries the omos attribution notice),
 * with {{slot:...}} placeholders filled from the backend's slots/.
 */
function assembleAgent(backendName, name, usedSlots) {
  const meta = loadBackend(backendName).agents[name];
  if (!meta) throw new Error(`agents/backends metadata is missing agent '${name}'`);
  const body = readFileSync(join(PKG_ROOT, "agents", "prompts", `${name}.md`), "utf8");
  return `---\n${meta.frontmatter.join("\n")}\n---\n\n${fillSlots(body, backendName, usedSlots)}`;
}

/**
 * Assemble every agent of a backend into outDir with copyOne semantics. When
 * usedSlots is omitted the backend owns slot accounting and warns about
 * unused slots; callers that render additional backend content (e.g. the
 * zcode AGENTS.md) pass a shared set and warn themselves once, after all
 * consumers have run.
 */
function assembleBackend(name, outDir, opts, counts, usedSlots) {
  const backend = loadBackend(name);
  const slots = usedSlots ?? new Set();
  for (const agentName of Object.keys(backend.agents).sort()) {
    writeAgent(join(outDir, `${agentName}.md`), assembleAgent(name, agentName, slots), opts, counts);
  }
  if (usedSlots === undefined) warnUnusedSlots(name, slots);
}

/** Native OpenCode target: core config plus native .opencode/agents/ subagents.
 *  When a user-level omos install is detected, installs the omos way instead —
 *  native agents would conflict with omos-provided agents. */
function applyOpencode(targetRoot, opts, counts) {
  const set = SETS.opencode;
  console.log(`\n.opencode/  (opencode.jsonc, AGENTS.md)`);
  copyEntries(set, set.entries, targetRoot, opts, counts);
  if (omosUserLevelPresent()) {
    console.log(`  note       user-level omos install detected; installing the omos way: omos config + prompt overrides copied, native .opencode/agents/ skipped to avoid agent conflicts (the plugin loads from user level)`);
    copyEntries(SETS.omos, SETS.omos.entries, targetRoot, opts, counts);
    return;
  }
  console.log(`  agents     .opencode/agents/  (native OpenCode agents, omos prompts attributed)`);
  assembleBackend("opencode", join(targetRoot, ".opencode", "agents"), opts, counts);
}

/** omos target: copy the omos project assets; the plugin itself loads from the
 *  user-level omos install enforced by the prerequisite gate — nothing is
 *  pinned and nothing is downloaded. */
function applyOmos(targetRoot, opts, counts) {
  console.log(`\n${SETS.omos.label}`);
  copyEntries(SETS.omos, SETS.omos.entries, targetRoot, opts, counts);
  if (existsSync(join(targetRoot, ".opencode", "agents"))) {
    console.log(`  note       existing .opencode/agents/ files may conflict with omos-provided agents; review them`);
  }
}

/**
 * Compose the ZCode global instruction file: the zcode backend header
 * (platform notes) followed by the shared orchestrator prompt body, so the
 * main agent is driven by the orchestrator prompt. Slot placeholders are
 * filled with zcode slots and recorded in usedSlots — applyZcode shares one
 * set across the subagent loop and this render so unused-slot accounting
 * covers both consumers.
 */
function composeZcodeAgentsMd(usedSlots = new Set()) {
  const header = readFileSync(join(PKG_ROOT, "agents", "backends", "zcode", "AGENTS.md"), "utf8");
  const body = readFileSync(join(PKG_ROOT, "agents", "prompts", "orchestrator.md"), "utf8");
  return `${header.trimEnd()}\n\n${fillSlots(body, "zcode", usedSlots)}`;
}

/**
 * ZCode target: installs ONLY at user level (~/.zcode) — the global AGENTS.md
 * plus subagents in ~/.zcode/agents/. Opt-in via --zcode; never touches the
 * project directory, no omos, no downloads. Destinations are displayed
 * relative to the home directory ("~/").
 */
function applyZcode(opts, counts) {
  const zRoot = join(homedir(), ".zcode");
  const display = { ...opts, displayRoot: homedir(), displayPrefix: "~/" };
  const usedSlots = new Set(); // shared by the subagent loop and the AGENTS.md render
  console.log(`\n~/.zcode/  (user-level: AGENTS.md, agents/*.md)`);
  assembleBackend("zcode", join(zRoot, "agents"), display, counts, usedSlots);
  writeAgent(join(zRoot, "AGENTS.md"), composeZcodeAgentsMd(usedSlots), display, counts);
  warnUnusedSlots("zcode", usedSlots);
  console.log(`  note       ZCode reads user-level subagents only; restart ZCode sessions to pick up changes`);
}

/**
 * Sync the distributable OpenCode assets from agents/backends/{opencode,omos}/
 * into this repository's live .opencode/ directory (this repo self-hosts omos).
 * In check mode, only reports drift.
 */
function syncOpencodeAssets({ check }) {
  const destRoot = join(PKG_ROOT, ".opencode");
  let drifted = 0;

  for (const backendName of ["opencode", "omos"]) {
    const srcRoot = join(PKG_ROOT, "agents", "backends", backendName);
    walk(srcRoot, srcRoot, (fileAbs) => {
      const rel = relative(srcRoot, fileAbs);
      if (rel === "agents.json") return; // assembly metadata, not a target asset
      if (rel.startsWith("slots/")) return; // {{slot:...}} texts, not runtime assets
      const dest = join(destRoot, rel);
      const content = readFileSync(fileAbs, "utf8");
      const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
      if (current === content) return;
      drifted++;
      if (!check) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, content);
        console.log(`synced: .opencode/${rel}`);
      } else {
        console.log(`outdated: .opencode/${rel}`);
      }
    });
  }
  return drifted;
}

/**
 * `my-agents assemble`: regenerate this repository's generated config from
 * the single-source agents/ tree: `.claude/agents/` (claude backend) and
 * `.opencode/` (opencode + omos backend assets). `--check` only verifies.
 */
function assembleCommand({ check }) {
  const outDir = join(PKG_ROOT, BACKENDS.claude);
  const backend = loadBackend("claude");
  let outdated = 0;
  const usedSlots = new Set();

  for (const name of Object.keys(backend.agents).sort()) {
    const dest = join(outDir, `${name}.md`);
    const content = assembleAgent("claude", name, usedSlots);
    if (check) {
      const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
      if (current !== content) {
        console.log(`outdated: ${name}.md`);
        outdated++;
      }
    } else {
      writeFileSync(dest, content);
      console.log(`assembled: ${name}.md`);
    }
  }
  warnUnusedSlots("claude", usedSlots);

  outdated += syncOpencodeAssets({ check });

  if (check) {
    if (outdated === 0) console.log("check OK: .claude/agents/ and .opencode/ match agents/ source");
    else {
      console.log(`check FAILED: ${outdated} file(s) outdated; run "my-agents assemble" to regenerate`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.command === "assemble") {
    assembleCommand(opts);
    return;
  }

  // Prerequisite gate: fail fast with no writes. --omos demands an existing
  // user-level omos install because the plugin loads from there — my-agents
  // never pins a plugin entry and never downloads anything.
  const prereqFailures = [];
  if (opts.targets.has("opencode") && !opencodeInstalled()) {
    prereqFailures.push("OpenCode is not installed (no 'opencode' on PATH); install OpenCode first");
  }
  if (opts.targets.has("omos")) {
    if (!opencodeInstalled()) prereqFailures.push("OpenCode is not installed (no 'opencode' on PATH); install OpenCode first");
    if (!omosUserLevelPresent()) prereqFailures.push("omos is not installed at user level (~/.config/opencode); install omos first, then rerun with --omos");
  }
  if (prereqFailures.length > 0) {
    for (const failure of prereqFailures) console.error(`error: ${failure}`);
    process.exitCode = 1;
    return;
  }

  const targetRoot = process.cwd();
  // The source-repo guard blocks project targets only; --zcode (user level)
  // is safe to run from anywhere, including the source repository itself.
  const projectTargets = opts.targets.has("opencode") || opts.targets.has("omos") || opts.targets.has("claude");
  if (projectTargets && resolve(targetRoot) === PKG_ROOT) {
    console.log("current directory is the my-agents source repository; nothing to copy. Use \"my-agents assemble\" to regenerate .claude/agents/ from agents/ source.");
    return;
  }

  const counts = { created: 0, overwritten: 0, skipped: 0 };
  const zcodeOnly = opts.targets.size === 1 && opts.targets.has("zcode");
  console.log(
    zcodeOnly
      ? `my-agents: installing ZCode agent setup into ~/.zcode (user-level)${opts.dryRun ? "  (dry-run)" : ""}`
      : `my-agents: installing agent setup into ${targetRoot}${opts.dryRun ? "  (dry-run)" : ""}`,
  );

  if (opts.targets.has("opencode")) applyOpencode(targetRoot, opts, counts);
  if (opts.targets.has("omos")) applyOmos(targetRoot, opts, counts); // after opencode so core config exists first
  if (opts.targets.has("claude")) {
    console.log(`\n${SETS.claude.label}`);
    copyEntries(SETS.claude, SETS.claude.entries, targetRoot, opts, counts);
    assembleBackend("claude", join(targetRoot, ".claude", "agents"), opts, counts);
  }
  if (opts.targets.has("zcode")) applyZcode(opts, counts);

  console.log(`\ndone: ${counts.created} created, ${counts.overwritten} overwritten, ${counts.skipped} skipped.`);
  if (counts.created > 0 && !opts.dryRun) {
    console.log("next: restart OpenCode / Claude Code / ZCode so the new config is picked up, then commit the copied files.");
  }
}

main().catch((err) => {
  console.error(`error: ${err?.stack || err}`);
  process.exitCode = 1;
});

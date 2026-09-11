#!/usr/bin/env node
// my-agents CLI — copy the OpenCode / Claude Code agent setup into the current
// project, plus opt-in user-level ZCode support (~/.zcode).
// Zero dependencies. Project targets always use the current working directory.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** npm package providing the omos plugin; auto-installed by OpenCode when listed in "plugin". */
const OMOS_PACKAGE = "oh-my-opencode-slim";

/** Entries copied for each target set. Names are copied as-is; dirs are walked recursively. */
const SETS = {
  opencode: {
    from: join(PKG_ROOT, "agents", "backends", "opencode"),
    dest: ".opencode",
    /** Always copied: plain OpenCode setup on its default primary agents. */
    coreEntries: ["AGENTS.md", "opencode.jsonc"],
    /** Only copied when the user consents to the omos plugin setup. */
    omosEntries: ["oh-my-opencode-slim.jsonc", "oh-my-opencode-slim", "package.json"],
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
  --opencode              set up .opencode/ (core config, omos-optional)
  --claude                set up .claude/ (Claude Code agents + shared settings)

ZCode target (opt-in only; user-level, writes to your home directory)
  --zcode                 install ~/.zcode/AGENTS.md + ~/.zcode/agents/*.md
                          (takes effect in new ZCode sessions)

Options
  --force                 overwrite files that already exist (default: skip them)
  --dry-run               print what would be copied without writing anything
  --pin-omos              enable the omos scheme without asking
  --no-omos               keep the non-omos scheme
  -h, --help              show this help

Notes
  The single source of truth is agents/: prompts/ holds each prompt body
  once (with its omos attribution notice), and backends/<name>/ holds
  everything backend-specific — assets plus per-agent header metadata in
  agents.json. This repository's .claude/agents/ and .opencode/ are
  generated from it — edit agents/ and run "my-agents assemble".

  OpenCode target has two schemes. The non-omos scheme (default without
  consent) copies only the core config (opencode.jsonc, AGENTS.md) plus
  native .opencode/agents/ subagents assembled from the omos-derived
  prompts — OpenCode downloads and executes nothing. The omos scheme
  (--pin-omos, or an interactive yes) instead copies the omos config and
  prompt overrides and pins "plugin": ["${OMOS_PACKAGE}"] so OpenCode
  downloads and executes the plugin from npm on next start. Consent is
  asked on interactive terminals; non-interactive runs default to the
  non-omos scheme. When a user-level omos install is already detected,
  omos files are copied without pinning the plugin entry.

  ZCode target (--zcode or "zcode") is never part of the default set. It
  composes the global ~/.zcode/AGENTS.md from agents/backends/zcode/AGENTS.md
  + agents/prompts/orchestrator.md, installs user-level subagents into
  ~/.zcode/agents/, skips existing files unless --force, and downloads
  nothing. ZCode picks up changes in new sessions only.

Examples
  npx my-agents                    # copy both .opencode/ and .claude/
  npx my-agents --opencode         # OpenCode setup only
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
  let pinOmos; // undefined = ask / decide by context, true = --pin-omos, false = --no-omos

  for (const arg of argv) {
    switch (arg) {
      case "--opencode":
      case "opencode":
        targets.add("opencode");
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
      case "--pin-omos":
        pinOmos = true;
        break;
      case "--no-omos":
        pinOmos = false;
        break;
      case "-h":
      case "--help":
        return { help: true };
      default:
        throw new Error(`unknown argument: ${arg}\n\n${HELP}`);
    }
  }

  if (targets.size === 0) {
    targets.add("opencode");
    targets.add("claude");
  }
  return { targets, force, dryRun, pinOmos };
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
      console.warn(`warn: missing entry '${entry}' in ${key} source, skipped`);
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

/**
 * Insert `"plugin": ["oh-my-opencode-slim"]` before the final closing brace of a
 * JSONC config text. Returns null when a "plugin" key already exists or the text
 * has no recognizable closing brace.
 */
function injectPluginEntry(text) {
  if (/(^|[^\w])"plugin"\s*:/.test(text)) return null;
  const end = text.lastIndexOf("}");
  if (end === -1) return null;
  const before = text.slice(0, end).replace(/\s+$/, "");
  const sep = /,$/.test(before) ? "" : ",";
  return `${before}${sep}\n  "plugin": ["${OMOS_PACKAGE}"]\n${text.slice(end)}`;
}

/**
 * Ask for consent on an interactive terminal. Returns null when no terminal
 * is attached (caller decides the non-interactive fallback), true on yes,
 * false on no or on stdin closing without a real answer.
 */
async function askConsent(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await Promise.race([
      rl.question(question),
      new Promise((res) => rl.once("close", () => res(null))),
    ]);
    if (answer === null) return false;
    const normalized = String(answer).trim().toLowerCase();
    return normalized === "" || normalized === "y" || normalized === "yes";
  } catch {
    return false;
  } finally {
    rl.close();
  }
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

/**
 * Decide the OpenCode scheme. The non-omos scheme keeps OpenCode on its
 * default primary agents: core config plus native `.opencode/agents/` files
 * converted from the omos-derived prompts. The omos scheme adds the omos
 * config and prompt overrides and pins the plugin so OpenCode downloads
 * and executes it from npm on next start — consent only.
 */
async function resolveOmos(opts) {
  if (opts.pinOmos === true) return { enabled: true, pin: true };
  if (opts.pinOmos === false) return { enabled: false, reason: "--no-omos" };
  if (omosUserLevelPresent()) return { enabled: true, pin: false, detected: true };
  const consent = await askConsent(
    `\n? Enable the omos setup (config + prompt overrides + "plugin": ["${OMOS_PACKAGE}"]) in .opencode/?\n` +
      `  OpenCode will download and execute the plugin from npm on next start.\n` +
      `  Declining keeps OpenCode on its default agents. [Y/n] `,
  );
  if (consent === null) return { enabled: false, reason: "non-interactive" };
  return consent ? { enabled: true, pin: true } : { enabled: false, reason: "declined" };
}

function pinOmosPlugin(targetRoot, { dryRun }) {
  const file = join(targetRoot, ".opencode", "opencode.jsonc");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  const next = injectPluginEntry(text);
  if (next === null) return; // config already declares a "plugin" entry
  if (!dryRun) writeFileSync(file, next);
  console.log(`  pin        .opencode/opencode.jsonc  ("plugin": ["${OMOS_PACKAGE}"])${dryRun ? "  (dry-run)" : ""}`);
}

async function applyOpencode(targetRoot, opts, counts) {
  const set = SETS.opencode;
  console.log(`\n.opencode/  (opencode.jsonc, AGENTS.md)`);
  copyEntries(set, set.coreEntries, targetRoot, opts, counts);

  const decision = await resolveOmos(opts);
  if (!decision.enabled) {
    console.log(`  agents     .opencode/agents/  (native OpenCode agents, omos prompts attributed)`);
    assembleBackend("opencode", join(targetRoot, ".opencode", "agents"), opts, counts);
    const hint =
      decision.reason === "--no-omos"
        ? "  (--no-omos; rerun with --pin-omos to enable omos)"
        : decision.reason === "non-interactive"
          ? "  (non-interactive; rerun with --pin-omos to enable omos)"
          : "  (rerun with --pin-omos to enable omos)";
    console.log(`  note       non-omos scheme: OpenCode primary agents + native .opencode/agents/ subagents${hint}`);
    return;
  }
  if (existsSync(join(targetRoot, ".opencode", "agents"))) {
    console.log(`  note       existing .opencode/agents/ files may conflict with omos-provided agents; review them`);
  }
  console.log(`  omos       oh-my-opencode-slim.jsonc, oh-my-opencode-slim/ prompt overrides, package.json`);
  copyEntries(set, set.omosEntries, targetRoot, opts, counts);
  if (decision.pin) pinOmosPlugin(targetRoot, opts);
  else if (decision.detected) {
    console.log(`  note       user-level omos install detected; omos config copied without pinning the plugin entry`);
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
 * Sync the distributable OpenCode assets from agents/backends/opencode/ into this
 * repository's live .opencode/ directory. In check mode, only reports drift.
 */
function syncOpencodeAssets({ check }) {
  const srcRoot = join(PKG_ROOT, "agents", "backends", "opencode");
  const destRoot = join(PKG_ROOT, ".opencode");
  let drifted = 0;

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
  return drifted;
}

/**
 * `my-agents assemble`: regenerate this repository's generated config from
 * the single-source agents/ tree: `.claude/agents/` (claude backend) and
 * `.opencode/` (OpenCode assets). `--check` only verifies.
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

  const targetRoot = process.cwd();
  // The source-repo guard blocks project targets only; --zcode (user level)
  // is safe to run from anywhere, including the source repository itself.
  const projectTargets = opts.targets.has("opencode") || opts.targets.has("claude");
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

  if (opts.targets.has("opencode")) await applyOpencode(targetRoot, opts, counts);
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

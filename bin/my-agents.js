#!/usr/bin/env node
// my-agents CLI — copy the OpenCode / Claude Code agent setup into the current project.
// Zero dependencies. Target directory is always the current working directory.

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
    label: ".opencode/  (opencode.jsonc, AGENTS.md, omos config + prompt overrides, package.json)",
    from: join(PKG_ROOT, ".opencode"),
    dest: ".opencode",
    entries: [
      "AGENTS.md",
      "opencode.jsonc",
      "oh-my-opencode-slim.jsonc",
      "oh-my-opencode-slim",
      "package.json",
    ],
  },
  claude: {
    label: ".claude/  (agents/*.md, settings.json)",
    from: join(PKG_ROOT, ".claude"),
    dest: ".claude",
    entries: ["agents", "settings.json"],
  },
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

const HELP = `my-agents — scaffold the OpenCode / Claude Code agent setup into the current project

Usage
  npx my-agents [targets...] [options]

Targets (default: both)
  --opencode              copy .opencode/ (OpenCode core config + omos prompt overrides)
  --claude                copy .claude/ (Claude Code agents + shared settings)

Options
  --force                 overwrite files that already exist (default: skip them)
  --dry-run               print what would be copied without writing anything
  --pin-omos              pin "oh-my-opencode-slim" into opencode.jsonc without asking
  --no-omos               do not pin the omos plugin
  -h, --help              show this help

Notes
  The OpenCode agents need the omos plugin (${OMOS_PACKAGE}). If the copied
  opencode.jsonc has no "plugin" entry, my-agents asks for consent and, on
  agreement, pins "plugin": ["${OMOS_PACKAGE}"] so OpenCode downloads and
  executes it from npm on next start. Without consent nothing is pinned and
  no download ever happens; pin later with --pin-omos. In non-interactive
  runs consent defaults to "no". When a user-level omos install is already
  detected, no pinning is offered.

Examples
  npx my-agents                    # copy both .opencode/ and .claude/
  npx my-agents --opencode         # OpenCode setup only
  npx my-agents claude --force     # positional target form, overwrite existing files
`;

function parseArgs(argv) {
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

function copySet(key, set, targetRoot, opts, counts) {
  if (!existsSync(set.from)) {
    console.warn(`warn: source directory for '${key}' is missing in this installation, skipped`);
    return;
  }

  console.log(`\n${set.label}`);
  for (const entry of set.entries) {
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
 * The copied OpenCode agents need the omos plugin. Pinning it into the
 * project config makes OpenCode download and execute that npm package on
 * next start, so it only happens with explicit user consent.
 */
async function ensureOmosPlugin(targetRoot, opts) {
  const { dryRun, pinOmos } = opts;
  const file = join(targetRoot, ".opencode", "opencode.jsonc");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  if (injectPluginEntry(text) === null) return; // config already declares a "plugin" entry

  let consent;
  if (pinOmos === true) {
    consent = true;
  } else if (pinOmos === false) {
    consent = false;
  } else if (omosUserLevelPresent()) {
    console.log(`  note       user-level omos install detected; not pinning "${OMOS_PACKAGE}" plugin entry`);
    return;
  } else {
    consent = await askConsent(
      `\n? Pin the omos plugin ("${OMOS_PACKAGE}") into .opencode/opencode.jsonc?\n` +
        `  OpenCode will download and execute it from npm on next start. [Y/n] `,
    );
    if (consent === null) {
      console.log(`  note       omos plugin NOT pinned (non-interactive). The OpenCode agents need it:`);
      console.log(`             rerun with --pin-omos, or add "plugin": ["${OMOS_PACKAGE}"] to .opencode/opencode.jsonc`);
      return;
    }
    if (!consent) {
      console.log(`  note       omos plugin not pinned. Rerun with --pin-omos to enable later.`);
      return;
    }
  }

  if (!consent) {
    console.log(`  note       omos plugin not pinned (--no-omos). Rerun with --pin-omos to enable later.`);
    return;
  }
  if (!dryRun) writeFileSync(file, injectPluginEntry(text));
  console.log(`  pin        .opencode/opencode.jsonc  ("plugin": ["${OMOS_PACKAGE}"])${dryRun ? "  (dry-run)" : ""}`);
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

  const targetRoot = process.cwd();
  if (resolve(targetRoot) === PKG_ROOT) {
    console.log("current directory is the my-agents source repository; nothing to copy.");
    return;
  }

  const counts = { created: 0, overwritten: 0, skipped: 0 };
  console.log(`my-agents: installing agent setup into ${targetRoot}${opts.dryRun ? "  (dry-run)" : ""}`);

  for (const key of ["opencode", "claude"]) {
    if (opts.targets.has(key)) copySet(key, SETS[key], targetRoot, opts, counts);
  }
  if (opts.targets.has("opencode")) await ensureOmosPlugin(targetRoot, opts);

  console.log(`\ndone: ${counts.created} created, ${counts.overwritten} overwritten, ${counts.skipped} skipped.`);
  if (counts.created > 0 && !opts.dryRun) {
    console.log("next: restart OpenCode / Claude Code so the new config is picked up, then commit the copied files.");
  }
}

main().catch((err) => {
  console.error(`error: ${err?.stack || err}`);
  process.exitCode = 1;
});

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const launcherRootsMemo = new Map();

/** Find dependency roots without starting a DSH process. Inputs can describe a temporary install. */
export function dshModuleRoots(home, { pathEnv = process.env.PATH ?? "", envModules = process.env.MY_WORKBENCH_DSH_NODE_MODULES } = {}) {
  const roots = [];
  const profilesDir = join(home, "profiles");
  roots.push(join(profilesDir, "node_modules"));
  if (existsSync(profilesDir)) {
    for (const name of readdirSync(profilesDir).sort()) {
      const dir = join(profilesDir, name);
      if (!statSync(dir).isDirectory()) continue;
      roots.push(join(dir, "node_modules"));
      roots.push(join(dir, ".dsh-module-fallback", "node_modules"));
    }
  }
  if (envModules) roots.push(envModules);
  roots.push(...dshLauncherModuleRoots(pathEnv));
  return roots;
}

/** npm shims and Unix symlinks both lead to a dependency closure beside the launcher. */
export function dshLauncherModuleRoots(pathEnv = process.env.PATH ?? "") {
  if (launcherRootsMemo.has(pathEnv)) return launcherRootsMemo.get(pathEnv);
  const roots = [];
  const seen = new Set();
  const push = (root) => {
    if (seen.has(root) || !existsSync(root)) return;
    seen.add(root);
    roots.push(root);
  };
  for (const dir of pathEnv.split(delimiter)) {
    if (dir === "") continue;
    for (const base of ["dsh", "dsh.cmd", "dsh.exe", "dsh.ps1"]) {
      const launcher = join(dir, base);
      if (!existsSync(launcher)) continue;
      const sibling = join(dir, "node_modules");
      push(sibling);
      push(join(sibling, "@deepseek-ai", "dsh", "node_modules"));
      let real = launcher;
      try {
        real = realpathSync(launcher);
      } catch {
        // An unreadable launcher still leaves the sibling candidates above.
      }
      let cur = dirname(real);
      for (;;) {
        if (basename(cur) === "node_modules") push(cur);
        if (basename(cur) === "dsh" && basename(dirname(cur)) === "@deepseek-ai") push(join(cur, "node_modules"));
        const parent = dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }
  }
  launcherRootsMemo.set(pathEnv, roots);
  return roots;
}

/** Resolve the root import without asking Node to execute a deployment package. */
export function packageEntryOf(manifest) {
  const exportsField = manifest.exports;
  const root = exportsField !== null && typeof exportsField === "object" ? exportsField["."] ?? exportsField : exportsField;
  if (typeof root === "string") return root;
  if (root !== null && typeof root === "object") {
    for (const key of ["default", "import", "node", "require"]) {
      if (typeof root[key] === "string") return root[key];
    }
  }
  if (typeof manifest.module === "string") return manifest.module;
  if (typeof manifest.main === "string") return manifest.main;
  return undefined;
}

export function resolveDshPackage(packageName, roots) {
  for (const root of roots) {
    const dir = join(root, packageName);
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const entry = packageEntryOf(manifest);
    if (entry === undefined) continue;
    const file = join(dir, entry);
    if (!existsSync(file)) continue;
    return { file, root, version: manifest.version ?? "unknown" };
  }
  return undefined;
}

/** Return the file: imports to bake into a lane host, before the installer writes anything. */
export function resolveLaneDependencies(home, deps, options = {}) {
  const roots = dshModuleRoots(home, options);
  const launcherRoots = dshLauncherModuleRoots(options.pathEnv ?? process.env.PATH ?? "");
  const specifiers = {};
  for (const [alias, packageName] of Object.entries(deps)) {
    const found = resolveDshPackage(packageName, roots);
    if (found === undefined) {
      const launcherNote = launcherRoots.length === 0
        ? "no 'dsh' launcher was found on PATH"
        : "the 'dsh' install on PATH was searched too but does not carry it";
      throw new Error(
        `cannot resolve '${packageName}' for the DSH lane plugin; searched: ${roots.join(", ")}. ` +
          `${launcherNote}. Start DSH once so it heals <DSH_HOME>/profiles/node_modules, set ` +
          "MY_WORKBENCH_DSH_NODE_MODULES to a node_modules that carries the package, or link the package into " +
          "the preset by hand (docs/dsh-lane-plugin/PLAN.md §5).",
      );
    }
    specifiers[alias] = pathToFileURL(found.file).href;
  }
  return specifiers;
}

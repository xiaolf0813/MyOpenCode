import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { dshModuleRoots, resolveLaneDependencies } from '../bin/dsh-deps.js'

const deps = { tools: '@deepseek-ai/dsh-tools', schema: '@deepseek-ai/schemastery' }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'my-workbench-dsh-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function packageAt(root, name, exportsField = './index.mjs') {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', exports: { '.': exportsField } }))
  const entry = typeof exportsField === 'string' ? exportsField : exportsField.import
  writeFileSync(join(dir, entry), 'export default {}\n')
  return join(dir, entry)
}

test('profile closure resolves the ESM entry and wins over the explicit fallback', t => {
  const dir = fixture(t)
  const home = join(dir, 'home')
  const profileRoot = join(home, 'profiles', 'node_modules')
  const fallback = join(dir, 'fallback')
  const toolsFile = packageAt(profileRoot, deps.tools)
  packageAt(profileRoot, deps.schema, { require: './index.cjs', import: './index.mjs' })
  packageAt(fallback, deps.tools)
  const roots = dshModuleRoots(home, { pathEnv: '', envModules: fallback })
  assert.equal(roots[0], profileRoot)
  const result = resolveLaneDependencies(home, deps, { pathEnv: '', envModules: fallback })
  assert.equal(result.tools, pathToFileURL(toolsFile).href)
  assert.match(result.schema, /index\.mjs$/)
})

test('unstarted DSH resolves packages from its launcher install without executing it', t => {
  const dir = fixture(t)
  const home = join(dir, 'home')
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'dsh.cmd'), 'not an executable command')
  const closure = join(bin, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules')
  const toolsFile = packageAt(closure, deps.tools)
  packageAt(closure, deps.schema)
  const result = resolveLaneDependencies(home, deps, { pathEnv: bin, envModules: '' })
  assert.equal(result.tools, pathToFileURL(toolsFile).href)
})

test('missing dependency reports the searched roots', t => {
  const dir = fixture(t)
  const home = join(dir, 'home')
  assert.throws(
    () => resolveLaneDependencies(home, deps, { pathEnv: '', envModules: '' }),
    error => error.message.includes(join(home, 'profiles', 'node_modules')) && error.message.includes("no 'dsh' launcher"),
  )
})

test('DSH install renders host, page, and prompts from one lane record', t => {
  const dir = fixture(t)
  const home = join(dir, 'home')
  const modules = join(dir, 'modules')
  mkdirSync(home)
  packageAt(modules, deps.tools)
  packageAt(modules, deps.schema)
  const result = spawnSync(process.execPath, [join(repo, 'bin', 'my-workbench.js'), '--dsh'], {
    cwd: repo,
    env: { ...process.env, DSH_HOME: home, MY_WORKBENCH_DSH_NODE_MODULES: modules },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const preset = join(home, '.agent-presets', 'my-workbench')
  const roster = readFileSync(join(preset, 'lane-plugin', 'src', 'roster.generated.js'), 'utf8')
  const host = readFileSync(join(preset, 'lane-plugin', 'src', 'index.js'), 'utf8')
  const prompts = readFileSync(join(preset, 'lane-plugin', 'src', 'prompts.generated.js'), 'utf8')
  const page = readFileSync(join(preset, 'lane-plugin-ui', 'lib', 'client.js'), 'utf8')
  for (const file of [
    join(preset, 'lane-plugin', 'src', 'index.js'),
    join(preset, 'lane-plugin', 'src', 'roster.generated.js'),
    join(preset, 'lane-plugin', 'src', 'prompts.generated.js'),
    join(preset, 'lane-plugin-ui', 'lib', 'client.js'),
  ]) {
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(checked.status, 0, checked.stderr)
  }
  assert.match(host, /from '\.\/roster\.generated\.js'/)
  assert.match(roster, /subagent_explorer/)
  assert.match(prompts, /"explorer":/)
  assert.match(page, /外部文档研究/)
  assert.doesNotMatch(page, /__MY_WORKBENCH_LANES__/)
})

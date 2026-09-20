# BACKLOG — 遗留项与跟进简报

这份文件是给**下一个接手者**（人或没有本次会话上下文的子 agent）的交接简报。
读它就够开工；需要更深的依据时再按下面的顺序读其它文件。

**阅读顺序**：`README.md`（本目录索引）→ 本文件 → `PLAN.md`（已定型的形态与决策）→
`FEASIBILITY.md`（每条结论都带 file:line 的调研）→ `UPSTREAM-ISSUE.md`（上游报告草稿）。

**这份文件本身不进 npm 包**：`package.json` 的 `files` 白名单只有 `bin/`、`agents/prompts/`、
`agents/backends/`，所以 `docs/` 永远留在仓库里。

---

## 0. 现状（已完成，别重做）

| 事实 | 值 |
| --- | --- |
| 版本 | `0.11.0`（`package.json`），已发布到 npm，带 SLSA provenance |
| GitHub Release | `v0.11.0` = Latest；tag `v0.11.0`（受 ruleset `protect release tags` 保护） |
| 发布闸门 | `.github/workflows/npm-publish.yml` 的 publish job 挂在 `environment: npm-publish`（需人工批准） |
| 仓库 | `D:\Users\xiaolf\WorkSpace\my-workbench`，`main` = `5419222` |
| 已安装 | `C:\Users\xiaolf\.dsh\.agent-presets\my-workbench\`（8 个文件）+ `profiles\web\cordis.patch.yml` 里一个托管块（只有一行惰性行） |
| 固定值 | `~/.dsh/settings.yaml` 的 `my-workbench-lanes:` 段（按赛道存 provider/model/reasoningEffort） |

已定型的形态（**不要重新设计**，除非 B4 的结论推翻它）：

- 七个 `subagent_*` 委派工具由**打包的 host 半** `lane-plugin/` 提供，只挂载在 MyWorkbench
  这个 preset 的 standing scope 里 —— 其它 preset、其它会话看不到它们。
- 设置页 `lane-plugin-ui/` 是**浏览器半**，只能由 profile 层的一行惰性行挂载（DSH 只扫描
  profile loader 自己的条目，preset 内的行永远不被扫描）。这一行就是 profile 层的全部足迹。
- host 半会**容忍**设置命名空间被重复注册（DSH 重挂载 stale 组合时不 dispose 旧 scope，
  详见 `UPSTREAM-ISSUE.md`），并在页面上按命名空间是否存活显示控件或惰性占位。

---

## 1. 遗留项

优先级是建议顺序；每项的“验收”就是它完成的定义。

### B1 · 用**发布产物**做一次真实安装验收 —— P1，最小

**为什么**：0.11.0 的线上 tarball 只在本仓库里跑过 `assemble --check`（已通过，36 个条目、
7 个赛道插件文件齐全）。`~/.dsh` 里那份 preset 是**从本地工作树**装的，发布产物到真实 DSH
的安装路径从未跑过。

**做法**：

```powershell
cd D:\Users\xiaolf\WorkSpace\my-workbench      # 或任意目录，npx 会取 npm 上的包
npx my-workbench@0.11.0 --dsh --force
```

**验收**：

1. preset 目录 8 个文件（`preset.yml`、`agent.cordis.yml`、`lane-plugin\{package.json,
   src\index.js, src\prompts.generated.js}`、`lane-plugin-ui\{package.json, src\index.js,
   lib\client.js}`）。
2. 两个被烘焙的 `file:` 导入指向真实存在的文件（`--dsh` 会在写入前解析，缺失时它自己会拒绝
   并列出搜过的路径）。
3. `cordis.patch.yml` 里仍是**一个**托管块、**一行**惰性行；用户自己的行（如 `mcp-codegraph`）
   未被触碰、未被重排。
4. `settings.yaml` 里已有的 `my-workbench-lanes:` 固定值**没被清掉**（`--dsh` 不碰用户层）。
5. 按 `README.md` 的“Order matters”走一遍：新开 DSH 会话 → 刷新页面 → 设置页列出 7 条赛道、
   7 个 `subagent_*` 工具在位。

**注意**：写 `C:\Users\xiaolf\.dsh` 在工作区沙箱之外 → 需要一次性
`sandbox_permissions: danger-full-access`（本会话反复如此，属预期，不是 bug）。host 半代码
没有变化，所以**不需要**重启 DSH。

**风险**：`--force` 会覆盖 preset 内的文件（幂等）；它从不写 profile 里用户的其它行。

---

### B2 · 把 `?? presets[0]` 回退观察补进上游报告 —— P2，小而独立，随时可做

**为什么**：我们曾据此误判“默认 preset 被改了”。事实是 host 侧一直是对的，只是界面在
配置的默认 preset 不在 roster 快照里时，静默显示了 roster 里的第一个。

**事实（已复核）**：`dsh-client-ui-agent-preset/lib/client.js`（部署内的实际路径带 scope 目录：
`D:\Programs\node_global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-agent-preset\lib\client.js`）

- `:1282` `this.fallback = presets.find((preset) => preset.isDefault)?.id ?? presets[0]?.id ?? ""`
- `:1286` `current: this.staged ?? (session === void 0 ? this.fallback : presetOf(session) ?? "")`

**建议行为**：显示配置里的 id 并标注「未安装」，而不是无声换成另一个 preset —— 现在的表现让
用户以为默认值变了。

**落点**：`UPSTREAM-ISSUE.md` 新增一节 “Tertiary observation”（或并入 “Secondary observation”）。

**验收**：文档新增一节，含上面两条 file:line，以及我们的观测（预设被移除的瞬间快照里
`isDefault` 消失 → chip 显示 `standard`；预设恢复后正常）。

---

### B3 · 让 host 半的代码变更**不再需要重启 DSH**（内容哈希文件名）—— P3

**为什么**：preset 行模块每个进程只 import 一次，specifier 不变时 Node 的 ESM 缓存会返回旧
模块 —— DSH 重挂载 stale 组合时用的仍是同一个 specifier（`UPSTREAM-ISSUE.md` 的
“Secondary observation”）。后果：`--dsh --force` 之后运行中的进程还是旧代码，用户升级 npm 包
也拿不到新行为，必须重启 DSH。这对迭代和升级都很难受。

**方向**：安装时把 host 模块写成**内容哈希文件名**（如 `lane-plugin/src/index.<hash8>.js`），
并让组合里那一行的 `name:` 指向它。specifier 变了 → 新模块 URL → 新代码。同目录内旧的哈希
文件应被清理（只清理本工具管理的文件名前缀）。

**落点**：

- `agents/backends/dsh/agent.cordis.yml:197`（`name: ./lane-plugin/src/index.js`，模板里的固定
  相对路径 —— 需要一个和 `{{dep:<alias>}}` 类似的占位/替换机制）。
- `bin/my-workbench.js`：`applyDsh()` → `installLanePlugin()`（写文件、烘焙依赖）、
  `installLaneUiPlugin()`、`writeLaneUiPatchRow()`（托管块的就地替换）。
- `assemble --check` 的 dsh 校验：别让“渲染结果带哈希”变成每次都不一致。

**已知坑（先验证再动手）**：

- 页面那侧的 profile 行 `name` 是 `file:///…/lane-plugin-ui/src/index.js`（`applyDsh():1038`
  用 `pathToFileURL` 拼出）。托管块已经是“就地替换”，所以同样可以哈希化 —— 但要先复核
  `dsh-client-modules` 的 `locatePkgJson`（`lib/index.js:679-709`，支持 `./` 与 `file:` 名字）
  对哈希文件名是否仍能定位到 `package.json`。**只有 page 那一半受影响**，host 行不参与 client 扫描。
- `lane-plugin-ui/lib/client.js` 里的 module id 必须与包名一致（`assemble --check` 已强制），
  哈希化别碰它。
- 命名空间重复注册的老问题依然在：新模块仍会 `settings.register`，而泄漏的旧挂载还持有该命名
  空间 → 依赖已发布的容忍逻辑（commit `cc1aa6e`）。**所以 B3 排在 B1 之后**：先确认线上那份
  确实带容忍。
- 若 B4 结论为“标准插件形态可行”，B3 的机制可能被替换掉（但 ESM 缓存对 profile 安装同样成立，
  未必被替换）—— 先看 B4。

**验收**：改一行 host 代码 → `--dsh --force` → **不重启 DSH**、只新开一个会话 → 新行为生效；
`assemble --check` 仍 exit 0；旧哈希文件不残留；卸载/回滚仍然只是“删托管块 + 删 preset 目录”。

---

### B4 · Spike：标准 `dsh plugin add` 插件形态能否实现同样功能 —— P4

**问题（用户明确问过）**：一个通过 `dsh plugin --profile web add` 安装的标准 DSH 插件，能否既
**只服务 MyWorkbench preset**（不污染其它 preset、不给标准会话加工具），又提供这七个工具和设置页？

**已知线索**：`dsh-tool-subagent` 是“装一次、按组合门控”的先例 —— 看它的 `installScoped` 与
`belongsToComposition`（`@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-subagent/`）。
要回答：

1. 这套门控是**公开契约**还是内部实现？
2. 第三方插件能否读到“当前组合是谁”（组合身份、scope、standing mount 之类的可达信息）？
3. 若门控不可用，profile 行会进入 root realm → 工具/命名空间对所有 preset 可见，这正是
   `PLAN.md` §10 判定变体 A 不可接受的原因。有没有中间形态（例如仅注册服务、由 preset 行消费）？

**收益（若可行）**：去掉 `{{dep:<alias>}}` 烘焙与 preset 内的 node_modules 探测；host 半与设置页
回到同一个包（client 半会被 profile loader 扫描到 → 不必再单独维护一行托管块）。

**交付物**：结论写进本目录（新文件，或 `PLAN.md` 的后续小节）；**先不要写代码**。

**验收**：明确回答“能 / 不能 / 需要上游支持”，每条结论带 file:line 证据；若可行，附迁移成本与
对已发布 0.11.x 用户的影响。

**边界**：不要为了 spike 往真实 `profiles\web\cordis.patch.yml` 里加东西（除了我们那个托管块）；
试验留给临时 profile，或只在文档层面推演 + 最小验证。

---

### B5 · 投递上游报告 —— P5，**必须先得到用户明确同意**

**草稿**：`UPSTREAM-ISSUE.md`（含最小复现、根因 file:line、观测时间线、两种修复建议）。

**通道**：上游 `deepseek-ai/deepseek-harness` 的 Issues 关闭、Discussions 打开（分类：
Announcements · General · Ideas · Polls · Q&A · Show Your Plugins!，没有 bug 分类）；草稿 `:10`
已给出提问式的开头。另有两条并行通道：DSH Web GUI 里的 `/feedback`；以及本地 issue
（`gh issue create -R xiaolf0813/my-workbench` —— 本仓的 issue 走 GitHub Issues，
见 `AGENTS.md` 的 Agent skills 一节）。

**规则**：一切对外发布动作先问用户。用户尚未决定要不要投、投哪条通道。本仓 issue 相对安全，
也同样要一句确认。

**验收**：用户点头后投递，并把链接回填到 `UPSTREAM-ISSUE.md` 末尾。

---

## 2. 建议顺序

```
B1（发布产物真实安装）
  └─ B2（补上游草稿，独立，可随时插入）
      └─ B4（标准插件形态的结论）
          └─ B3（哈希文件名；若 B4 可行则重估）
              └─ B5（对外投递，需用户同意）
```

---

## 3. 边界与操作规则（别越线）

- **不污染其它 preset。** 工具与设置命名空间的挂载点只能是 MyWorkbench 这个 preset ——
  用户明确要求“聚焦 preset 级”。profile 层那**一行必须保持惰性**：无依赖、无工具、无提示词
  段落、无服务、无设置命名空间。
- **不手改已安装的 `cordis.patch.yml` 托管块**：它由 `my-workbench --dsh` 维护、就地替换。
- **host 半改动要重启 DSH，页面改动只需刷新浏览器**（B3 就是要消掉前者）。
- **验证只有一条命令**：`node bin/my-workbench.js assemble --check`（本仓没有测试套件，见
  `AGENTS.md`）。它同时渲染 `.claude/`、`.opencode/`、dsh 组合与赛道插件，并做插件文件解析检查。
- **提交粒度**：一个遗留项一个提交；提交信息用现在时祈使句（看 `git log --oneline` 的风格），
  提交前确保 `assemble --check` exit 0。
- **文档语言**：仓库文档为英文，`README_CN.md` 是中文镜像；本文件是给用户/接手者的中文简报，
  按需再补英文版。
- **沙箱**：写 `C:\Users\xiaolf\.dsh`、`git push` 等会撞文件沙箱 → 用一次性
  `sandbox_permissions`（`danger-full-access`）重试同一条命令并给出理由；不要绕路或换写法。
  Windows 上 SSH 相关命令可能报 `couldn't create signal pipe, Win32 error 5`，那正是这个沙箱边界。

## 4. 环境速查

| 项 | 值 |
| --- | --- |
| 仓库 | `D:\Users\xiaolf\WorkSpace\my-workbench` |
| DSH | `@deepseek-ai/dsh` **0.1.5-rc.2**，装在 `D:\Programs\node_global\node_modules\@deepseek-ai\dsh`（各包在 `node_modules\@deepseek-ai\<pkg>\` 下 —— 带 scope 目录，别猜成一级） |
| DSH home | `C:\Users\xiaolf\.dsh`（`DSH_HOME`），profile 名 `web`，GUI `http://127.0.0.1:3080` |
| 运行时 | Node **v24.15.0**，Windows **10.0.26200** |
| 已安装 preset | `<DSH_HOME>\.agent-presets\my-workbench\`（8 文件） |
| profile 行 | `<DSH_HOME>\profiles\web\cordis.patch.yml` 的托管块（`id: my-workbench-lanes-ui`） |
| 固定值 | `<DSH_HOME>\settings.yaml` → `my-workbench-lanes:` |

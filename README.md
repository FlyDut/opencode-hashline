<div align="center">

<img src="banner.jpg" alt="opencode-hashline banner" width="100%" />

# 🔗 opencode-hashline

**基于内容寻址的行哈希，实现 AI 对代码的精准编辑**

[![CI](https://github.com/FlyDut/opencode-hashline/actions/workflows/ci.yml/badge.svg)](https://github.com/FlyDut/opencode-hashline/actions/workflows/ci.yml)
[![Release](https://github.com/FlyDut/opencode-hashline/actions/workflows/release.yml/badge.svg)](https://github.com/FlyDut/opencode-hashline/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@flydut%2fopencode-hashline.svg?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@flydut/opencode-hashline)
[![npm downloads](https://img.shields.io/npm/dm/@flydut%2fopencode-hashline.svg?style=flat&colorA=18181B&colorB=28CF8D)](https://www.npmjs.com/package/@flydut/opencode-hashline)
[![GitHub release](https://img.shields.io/github/v/release/FlyDut/opencode-hashline?style=flat&colorA=18181B&colorB=28CF8D)](https://github.com/FlyDut/opencode-hashline/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat&colorA=18181B&colorB=28CF8D)](LICENSE)
[![semantic-release](https://img.shields.io/badge/semantic--release-auto-e10079?style=flat&colorA=18181B)](https://github.com/semantic-release/semantic-release)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat&colorA=18181B&colorB=3178C6)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-ESM-green?style=flat&colorA=18181B&colorB=339933)](https://nodejs.org/)

[🇷🇺 Русский](README.ru.md) | [🇬🇧 English](README.en.md) | **🇨🇳 简体中文**

<br />

*Hashline 是 [OpenCode](https://github.com/anomalyco/opencode) 的插件——为每一行代码附加一个确定性的哈希标签，让 AI 能以外科手术般的精度引用和编辑代码。*

</div>

---

## 📖 什么是 Hashline？

Hashline 会为文件的每一行附加一个简短、确定性的十六进制哈希标签。当 AI 读取文件时，它看到的是：

```
#HL 1:a3f|function hello() {
#HL 2:f1c|  return "world";
#HL 3:0e7|}
```

> **说明：** 哈希长度是自适应的——取决于文件大小（≤4096 行为 3 个字符，>4096 行为 4 个字符）。最小哈希长度为 3，以降低碰撞风险。`#HL ` 前缀用于在去除哈希时防止误删，并且是可配置的。

随后 AI 模型就可以通过哈希标签引用行来进行精准编辑：

- **"替换第 `2:f1c` 行"** —— 无歧义地定位到特定行
- **"将从 `1:a3f` 到 `3:0e7` 的代码块替换掉"** —— 定位一个行范围
- **"在 `3:0e7` 之后插入"** —— 在精确的位置插入

### 🤔 为什么这有帮助？

Hashline 解决了现有两种 AI 文件编辑方式存在的根本性问题：

- **`str_replace`** 要求 `old_string` 完全精确匹配。只要多一个空格、缩进错误、或文件里出现重复行——编辑就会以 "String to replace not found" 失败。这个问题非常常见，在 GitHub 上甚至有一个[包含 27+ 个相关 issue 的超长帖子](https://github.com/anthropics/claude-code/issues)。
- **`apply_patch`**（unified diff）只对专门训练过该格式的模型有效。在其他模型上结果惨不忍睹：Grok 4 有 **50.7%** 的补丁失败，GLM-4.7 有 **46.2%** 失败（[来源](https://habr.com/ru/companies/bothub/news/995986/)）。

Hashline 用唯一的 `lineNumber:hash` 来定位每一行。无需字符串匹配，也不依赖模型的特有训练——只有精准、可验证的行定位。

---

## ✨ 特性

### 📏 自适应哈希长度

哈希长度会根据文件大小自动调整以最大限度减少碰撞：

| 文件大小 | 哈希长度 | 可能取值 |
|-----------|:----------:|:---------------:|
| ≤ 4,096 行 | 3 个 hex 字符 | 4,096 |
| > 4,096 行 | 4 个 hex 字符 | 65,536 |

### 🏷️ 魔法前缀（`#HL `）

行会带上一个可配置的前缀（默认：`#HL `），以防止去除哈希时产生误删。这能确保像 `1:ab|some data` 这样的数据行不会被意外剥离。

```
#HL 1:a3|function hello() {
#HL 2:f1|  return "world";
#HL 3:0e|}
```

前缀可以自定义或禁用，以保持向后兼容：

```typescript
// 自定义前缀
const hl = createHashline({ prefix: ">> " });

// 禁用前缀（legacy 格式："1:a3|code"）
const hl = createHashline({ prefix: false });
```

### 💾 LRU 缓存

内置 LRU 缓存（`filePath → annotatedContent`），大小可配置（默认：100 个文件）。当同一文件内容未变再次读取时，会立即返回缓存结果。文件内容变化时缓存会自动失效。

### ✅ 哈希校验

校验某一行自上次读取以来是否发生过变化——可防止竞态条件：

```typescript
import { verifyHash } from "@flydut/opencode-hashline/utils";

const result = verifyHash(2, "f1c", currentContent);
if (!result.valid) {
  console.error(result.message); // "Hash mismatch at line 2: ..."
}
```

哈希校验使用的是所提供哈希引用的长度（而非当前文件大小），因此像 `2:f1` 这样的引用即使文件变长了也依然有效。

### 🔒 文件修订（`fileRev`）

除了逐行哈希之外，hashline 还会计算整个文件的哈希（FNV-1a，8 个 hex 字符）。它会被作为第一行注释前缀：

```
#HL REV:72c4946c
#HL 1:a3f|function hello() {
#HL 2:f1c|  return "world";
```

编辑时请将 `fileRev` 传给 `hashline_edit`——如果文件自读取后发生了变化，编辑会被以 `FILE_REV_MISMATCH` 拒绝。

### 🔄 安全重放（Safe Reapply）

如果某一行发生了移动（例如因为上方插入了内容），`safeReapply` 会通过内容哈希找到它：

- **1 个候选** —— 编辑应用到新位置
- **>1 个候选** —— 抛出 `AMBIGUOUS_REAPPLY` 错误（有歧义）
- **0 个候选** —— 抛出 `HASH_MISMATCH` 错误

```typescript
const result = applyHashEdit(
  { operation: "replace", startRef: "1:a3f", replacement: "new" },
  content,
  undefined,
  true, // safeReapply
);
```

### 🚀 批量编辑（Batch Edits）

`hashline_edit` 工具支持通过 `edits` 数组在一次调用内应用**多次编辑**，而无需在每次编辑之间重新读取文件：

```json
{
  "path": "src/app.ts",
  "edits": [
    { "operation": "replace", "startRef": "1:a3f", "endRef": "3:0e7", "replacement": "function goodbye() {" },
    { "operation": "delete",  "startRef": "12:f4a" },
    { "operation": "insert",  "startRef": "8:c2d", "replacement": "  return 'farewell';" }
  ]
}
```

工具内部会**按起始行号从大到小（从下到上）**自动对编辑进行排序并依次应用，因此行号不会发生漂移——即使前面的编辑增加了/删除了行，后续编辑的引用依然有效。这对 AI 而言大幅提升了可靠性，因为它可以在一次往返中完成对同一文件的所有改动，同时省去了编辑间重复读取带来的额外开销。

- 每次编辑的每一项都支持 `operation` / `startRef` / `endRef` / `replacement` 字段。
- `hashline_edit` 只接受 `edits` 数组进行批量编辑；单次编辑请使用仅包含一项的 `edits` 数组。
- 底层核心函数为 `applyHashEdits(edits, content, hashLen?)`，可用于编程式调用。

### 🌐 国际化（i18n，中英双语）

插件所有用户可见的字符串都已支持中英双语：系统提示、工具描述与参数、工具输出、错误消息与诊断信息等。通过 `locale` 配置项切换语言：

| 语言 | 值 |
|------|-----|
| 简体中文 | `"zh"` |
| English | `"en"`（默认） |

```json
{
  "locale": "zh"
}
```

> **说明：** 错误码本身（如 `FILE_REV_MISMATCH`）以及工具输出中的 `operation` 枚举值保持英文，以保证机器可读性和跨语言一致性。

### 🏷️ 结构化错误（Structured Errors）

所有 hashline 错误都是 `HashlineError` 的实例，带有错误码、诊断信息和提示：

| 错误码 | 说明 |
|------|-------------|
| `HASH_MISMATCH` | 行内容自上次读取后发生了变化 |
| `FILE_REV_MISMATCH` | 文件自上次读取后被修改过 |
| `AMBIGUOUS_REAPPLY` | 安全重放时发现多个候选 |
| `TARGET_OUT_OF_RANGE` | 行号超出文件长度 |
| `INVALID_REF` | 哈希引用格式错误 |
| `INVALID_RANGE` | 起始行在结束行之后 |
| `MISSING_REPLACEMENT` | replace/insert 操作缺少内容 |

### 🔍 对缩进敏感

哈希计算使用 `trimEnd()`（而非 `trim()`），因此前导空白（缩进）的变化会被视为内容变化，而尾随空白会被忽略。

### 📐 范围操作

按哈希引用解析和替换行范围：

```typescript
import { resolveRange, replaceRange } from "@flydut/opencode-hashline/utils";

// 获取两个哈希引用之间的行
const range = resolveRange("1:a3f", "3:0e7", content);
console.log(range.lines); // ["function hello() {", '  return "world";', "}"]

// 用新内容替换一个范围
const newContent = replaceRange(
  "1:a3f", "3:0e7", content,
  "function goodbye() {\n  return 'farewell';\n}"
);
```

### ⚙️ 可配置

使用特定设置创建自定义 Hashline 实例：

```typescript
import { createHashline } from "@flydut/opencode-hashline/utils";

const hl = createHashline({
  exclude: ["**/node_modules/**", "**/*.min.js"],
  maxFileSize: 512_000,  // 512 KB
  hashLength: 3,         // 强制 3 字符哈希
  cacheSize: 200,        // 最多缓存 200 个文件
  prefix: "#HL ",        // 魔法前缀（默认）
});

// 使用配置好的实例
const annotated = hl.formatFileWithHashes(content, "src/app.ts");
const isExcluded = hl.shouldExclude("node_modules/foo.js"); // true
```

#### 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `exclude` | `string[]` | 见下方 | 需要跳过的文件的 Glob 模式 |
| `maxFileSize` | `number` | `1_048_576` (1 MiB) | 最大文件大小（字节） |
| `hashLength` | `number \| undefined` | `undefined`（自适应） | 强制指定哈希长度 |
| `cacheSize` | `number` | `100` | LRU 缓存中的最大文件数 |
| `prefix` | `string \| false` | `"#HL "` | 行前缀（`false` 表示禁用） |
| `debug` | `boolean` | `false` | 是否输出调试日志到 `~/.config/opencode/hashline-debug.log` |
| `fileRev` | `boolean` | `true` | 是否在注释中包含文件修订哈希（`#HL REV:...`） |
| `safeReapply` | `boolean` | `false` | 通过内容哈希自动重定位已移动的行 |
| `locale` | `string` | `"en"` | 界面显示语言（`"en"` 或 `"zh"`） |

默认排除模式涵盖：锁文件、`node_modules`、压缩后的文件、二进制文件（图片、字体、压缩包等）。

---

## 📦 安装

```bash
npm install @flydut/opencode-hashline
```

---

## 🔧 配置

将插件添加到你的 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@flydut/opencode-hashline"]
}
```

### 配置文件

插件按以下位置加载配置（按优先级排序，后面的覆盖前面的）：

| 优先级 | 位置 | 作用域 |
|:--------:|----------|-------|
| 1 | `~/.config/opencode/opencode-hashline.json` | 全局（所有项目） |
| 2 | `<project>/opencode-hashline.json` | 项目本地 |
| 3 | 通过 `createHashlinePlugin()` 以编程方式配置 | 工厂参数 |

`opencode-hashline.json` 示例：

```json
{
  "exclude": ["**/node_modules/**", "**/*.min.js"],
  "maxFileSize": 1048576,
  "hashLength": 0,
  "cacheSize": 100,
  "prefix": "#HL ",
  "locale": "zh"
}
```

这就行了！插件会自动：

| # | 动作 | 说明 |
|:-:|--------|-------------|
| 1 | 📝 **注释文件读取** | 当 AI 读取文件时，每一行都会带上 `#HL` 哈希前缀 |
| 2 | 📎 **注释 `@file` 提及** | 通过 `@filename` 附加到提示词中的文件同样会被加上哈希行注释 |
| 3 | ✂️ **编辑时去除哈希前缀** | 当 AI 写入/编辑文件时，会在应用改动前去除哈希前缀 |
| 4 | 🧠 **注入系统提示指令** | 告诉 AI 如何解读和使用 hashline 引用 |
| 5 | 💾 **缓存结果** | 对同一文件的重复读取会返回缓存的注释 |
| 6 | 🔍 **按工具过滤** | 只有文件读取类工具（如 `read_file`、`cat`、`view`）会获得注释；其他工具不受影响 |
| 7 | ⚙️ **遵循配置** | 排除的文件以及超过 `maxFileSize` 的文件会被跳过 |
| 8 | 🧩 **注册 `hashline_edit` 工具** | 通过哈希引用执行 replace/delete/insert，无需精确的 `old_string` 匹配；通过 `edits` 数组进行批量编辑 |

---

## 🛠️ 工作原理

### 哈希计算

每一行的哈希由以下内容计算得出：
- **基于 0 的行索引**
- **经过 trimEnd 处理的行内容** —— 前导空白（缩进）是**有意义**的

这会经过 **FNV-1a** 哈希函数，根据文件大小缩减到相应的模数，并以 hex 字符串呈现。

### 插件 Hooks 与工具

插件注册了四个 OpenCode hook 和一个自定义工具：

| Hook | 用途 |
|------|---------|
| `tool.hashline_edit` | 通过 `5:a3f` 或 `#HL 5:a3f|...` 之类的引用进行哈希感知编辑 |
| `tool.execute.after` | 将 hashline 注释注入到文件读取工具的输出中 |
| `tool.execute.before` | 从文件编辑工具的参数中去除 hashline 前缀 |
| `chat.message` | 注释用户消息中的 `@file` 提及（将注释后的内容写入临时文件并替换 URL） |
| `experimental.chat.system.transform` | 向系统提示中添加 hashline 使用说明 |

### 工具识别启发式（`isFileReadTool`）

插件需要判断哪些工具是"文件读取"类工具（需要注释其输出），哪些是"文件编辑"类工具（需要从其输入中去除哈希前缀）。由于 OpenCode 插件 API 没有暴露语义化的工具分类，插件采用基于名称的启发式判断：

**精确匹配** —— 工具名称（不区分大小写）与白名单比较：
- `read`、`file_read`、`read_file`、`cat`、`view`

**点号后缀匹配** —— 对于像 `mcp.read` 或 `custom_provider.file_read` 这类带命名空间的工具，取最后一个 `.` 之后的部分与同一列表匹配。

**兜底启发式** —— 如果工具带有 `path`、`filePath` 或 `file` 参数，**且**工具名称不包含写/编辑/执行相关标识（`write`、`edit`、`patch`、`execute`、`run`、`command`、`shell`、`bash`），则视为文件读取工具。

**如何自定义：**
- 让你自定义的工具命名符合上述某个模式（例如 `my_read_file`）
- 在其参数中包含 `path`、`filePath` 或 `file`
- 或者在 fork 中扩展 `FILE_READ_TOOLS` 列表

`isFileReadTool()` 函数已导出，可用于测试和高级用途：

```typescript
import { isFileReadTool } from "@flydut/opencode-hashline/utils";

isFileReadTool("read_file");                          // true
isFileReadTool("mcp.read");                           // true
isFileReadTool("custom_reader", { path: "app.ts" });  // true（启发式）
isFileReadTool("file_write", { path: "app.ts" });     // false（含写标识）
```

### 编程式 API

核心工具从 `@flydut/opencode-hashline/utils` 子路径导出（以避免与 OpenCode 的插件加载器冲突，该加载器会把每个导出当作 Plugin 函数调用）：

```typescript
import {
  computeLineHash,
  formatFileWithHashes,
  stripHashes,
  parseHashRef,
  normalizeHashRef,
  buildHashMap,
  getAdaptiveHashLength,
  verifyHash,
  resolveRange,
  replaceRange,
  applyHashEdit,
  applyHashEdits,
  HashlineCache,
  createHashline,
  shouldExclude,
  matchesGlob,
  resolveConfig,
  DEFAULT_PREFIX,
} from "@flydut/opencode-hashline/utils";
```

### 核心函数

```typescript
// 计算单行的哈希
const hash = computeLineHash(0, "function hello() {"); // 例如 "a3f"

// 计算指定长度的哈希
const hash4 = computeLineHash(0, "function hello() {", 4); // 例如 "a3f2"

// 注释整个文件内容（自适应哈希长度，带 #HL 前缀）
const annotated = formatFileWithHashes(fileContent);
// "#HL 1:a3|function hello() {\n#HL 2:f1|  return \"world\";\n#HL 3:0e|}"

// 用指定哈希长度注释
const annotated3 = formatFileWithHashes(fileContent, 3);

// 不带前缀注释（legacy 格式）
const annotatedLegacy = formatFileWithHashes(fileContent, undefined, false);

// 去除注释，得到原始内容
const original = stripHashes(annotated);
```

### 哈希引用与校验

```typescript
// 解析哈希引用
const { line, hash } = parseHashRef("2:f1c"); // { line: 2, hash: "f1c" }

// 从注释行中规范化
const ref = normalizeHashRef("#HL 2:f1c|const x = 1;"); // "2:f1c"

// 构建查找映射
const map = buildHashMap(fileContent); // Map<"2:f1c", 2>

// 校验哈希引用（使用 hash.length，而非文件大小）
const result = verifyHash(2, "f1c", fileContent);
```

### 范围操作

```typescript
// 解析范围
const range = resolveRange("1:a3f", "3:0e7", fileContent);

// 替换范围
const newContent = replaceRange("1:a3f", "3:0e7", fileContent, "new content");

// 哈希感知的编辑操作（replace/delete/insert_before/insert_after）
const edited = applyHashEdit(
  { operation: "replace", startRef: "1:a3f", endRef: "3:0e7", replacement: "new content" },
  fileContent
).content;

// 批量编辑：按起始行号从大到小自动应用多次编辑，避免行号漂移
const { content, edits } = applyHashEdits(
  [
    { operation: "replace", startRef: "1:a3f", endRef: "3:0e7", replacement: "function goodbye() {" },
    { operation: "delete",  startRef: "12:f4a" },
  ],
  fileContent
);
```

### 工具函数

```typescript
// 检查文件是否应被排除
const excluded = shouldExclude("node_modules/foo.js", ["**/node_modules/**"]);

// 创建配置好的实例
const hl = createHashline({ cacheSize: 50, hashLength: 3 });
```

---

## 📊 基准测试

### 正确性：hashline vs str_replace vs apply_patch

我们用来自 [react-edit-benchmark](https://github.com/can1357/oh-my-pi/tree/main/packages/react-edit-benchmark) 的 **60 个 fixture** —— 带有已知 bug 的 React 变异源码文件（布尔取反、运算符调换、删除了 guard 子句等）对三种方法进行了测试：

| | hashline | str_replace | apply_patch |
|---|:---:|:---:|:---:|
| **通过** | **60/60 (100%)** | 58/60 (96.7%) | **60/60 (100%)** |
| **失败** | 0 | 2 | 0 |
| **有歧义的编辑** | 0 | 4 | 0 |

带上下文行的 `apply_patch` 在**模型能正确生成补丁**的前提下，可靠性可以与 hashline 匹敌。`apply_patch` 的关键弱点是它依赖模型的特有训练：没有针对该格式训练过的模型会产生畸形的 diff（缺少上下文行、缩进错误），导致补丁应用失败。

`str_replace` 在 `old_string` 在文件中出现多次时会失败（重复的 guard 子句、相似的代码块）。Hashline 通过 `lineNumber:hash` 对每一行进行唯一寻址——歧义不可能发生，也无需任何模型特有格式。

```bash
# 自己运行：
npx tsx benchmark/run.ts               # hashline 模式
npx tsx benchmark/run.ts --no-hash     # str_replace 模式
npx tsx benchmark/run.ts --apply-patch # apply_patch 模式
```

<details>
<summary>str_replace 失败用例（structural 分类）</summary>

- `structural-remove-early-return-001` —— `old_string` 匹配了多个位置，替换到了错误的位置
- `structural-remove-early-return-002` —— 同样的问题
- `structural-delete-statement-002` —— 有歧义的匹配（第一个匹配恰好是正确的）
- `structural-delete-statement-003` —— 有歧义的匹配（第一个匹配恰好是正确的）

</details>

### Token 开销

Hashline 注释每行会增加 `#HL <line>:<hash>|` 前缀（约 12 个字符 / 约 3 个 token）：

| | 纯净文本 | 带注释 | 开销 |
|---|---:|---:|:---:|
| **字符** | 404K | 564K | +40% |
| **Token（约）** | ~101K | ~141K | +40% |

开销稳定在约 40%，与文件大小无关。对于典型的 200 行文件（约 800 token），hashline 会增加约 600 个 token——在 200K 的上下文窗口中可忽略不计。

### 性能

| 文件大小 | 注释 | 编辑 | 去除 |
|----------:|:--------:|:----:|:-----:|
| **10** 行 | 0.05 ms | 0.01 ms | 0.03 ms |
| **100** 行 | 0.12 ms | 0.02 ms | 0.08 ms |
| **1,000** 行 | 0.95 ms | 0.04 ms | 0.60 ms |
| **5,000** 行 | 4.50 ms | 0.08 ms | 2.80 ms |
| **10,000** 行 | 9.20 ms | 0.10 ms | 5.50 ms |

> 一个典型的 1,000 行源文件注释耗时 **< 1ms** —— 用户几乎感知不到。

---

## 🧑‍💻 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 构建
npm run build

# 类型检查
npm run typecheck
```

---

## 💡 灵感与背景

hashline 的构想受到 **oh-my-pi**（[can1357](https://github.com/can1357/oh-my-pi) 的项目——一个 AI 编码智能体工具包：coding agent CLI、统一 LLM API、TUI 库）以及 "The Harness Problem" 一文的启发。

**The Harness Problem（束缚问题）** 描述了当前 AI 编码工具的一个根本局限：虽然现代 LLM 极其强大，但 *harness* 层——即向模型提供上下文并把它的编辑回写到文件的工具层——会丢失信息并引入错误。模型能看到文件内容，但当它需要编辑时，必须"猜测"周围上下文来做 search-and-replace（这会在重复行上失败）或生成 diff（这在实践中不可靠）。

Hashline 通过为每一行分配一个简短、确定性的哈希标签（例如 `2:f1c`）来解决这个问题，使行定位**精确且无歧义**。模型可以精准引用任意一行或范围，彻底消除了 off-by-one 错误和重复行混淆。

高级特性——**文件修订**（`fileRev`）、**安全重放**（safe reapply）和**结构化错误**（structured errors）——受到 [OzeroHAX](https://github.com/OzeroHAX/AssistAgents) 的 **AssistAgents** 中基于哈希编辑实现的启发，该项目独立地为 OpenCode 应用了类似思路，并附加了完整性检查和错误诊断。

**参考资料：**
- [oh-my-pi by can1357](https://github.com/can1357/oh-my-pi) —— AI 编码智能体工具包：coding agent CLI、统一 LLM API、TUI 库
- [The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/) —— 详细介绍该问题的博客文章
- [AssistAgents by OzeroHAX](https://github.com/OzeroHAX/AssistAgents) —— 为 OpenCode 提供的基于哈希的编辑，支持文件修订、安全重放和结构化冲突
- [Habr 上的方案介绍](https://habr.com/ru/companies/bothub/news/995986/) —— 俄语方案概述

---

## 📄 许可证

[MIT](LICENSE) © opencode-hashline contributors

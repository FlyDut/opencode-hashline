/**
 * Lightweight i18n for the Hashline plugin.
 *
 * Currently supports English ("en", default) and Simplified Chinese ("zh").
 * Locale is set once at plugin init; the `t()` helper reads the current locale
 * from module state so core functions (which build errors/diagnostics) don't
 * need the locale threaded through every signature.
 */

export type Locale = "en" | "zh";

type Translation = { en: string; zh: string };

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Resolve a config value (e.g. "zh-CN", "zh", "en") into a supported Locale.
 * Anything that isn't recognized as Chinese falls back to English.
 */
export function resolveLocale(value?: string): Locale {
  if (value && /^zh(-|_)?/i.test(value)) return "zh";
  return "en";
}

type InterpVars = Record<string, string | number | undefined>;

function interpolate(template: string, vars?: InterpVars): string {
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return out;
}

const MESSAGES: Record<string, Translation> = {
  // -------------------------------------------------------------------------
  // Core errors (hashline.ts)
  // -------------------------------------------------------------------------
  "err.revMismatch": {
    en: 'File revision mismatch: expected "{expected}", got "{actual}". The file has changed since it was last read.',
    zh: '文件修订号不匹配：期望 "{expected}"，实际 "{actual}"。文件自上次读取后已发生变化。',
  },
  "err.invalidRange": {
    en: "Invalid range: start line {start} is after end line {end}",
    zh: "无效范围：起始行 {start} 位于结束行 {end} 之后",
  },
  "err.invalidRef": {
    en: 'Invalid hash reference: "{display}". Expected format: "<line>:<2-8 char hex>"',
    zh: '无效的哈希引用："{display}"。预期格式："<行号>:<2-8 位十六进制>"',
  },
  "err.invalidRef.annotated": {
    en: 'Invalid hash reference: "{display}". Expected "<line>:<hash>" or an annotated line like "#HL <line>:<hash>|..."',
    zh: '无效的哈希引用："{display}"。预期为 "<行号>:<哈希>" 或带注解的行，如 "#HL <行号>:<哈希>|..."',
  },
  "err.missingReplacement": {
    en: 'Operation "{operation}" requires "replacement" content',
    zh: '操作 "{operation}" 需要提供 "replacement" 内容',
  },
  "err.targetOutOfRange": {
    en: "Line {line} is out of range (file has {count} lines)",
    zh: "第 {line} 行超出范围（文件共 {count} 行）",
  },
  "err.hashMismatch": {
    en: 'Hash mismatch at line {line}: expected "{expected}", got "{actual}". The file may have changed since it was read.',
    zh: '第 {line} 行哈希不匹配：期望 "{expected}"，实际 "{actual}"。文件自读取后可能已发生变化。',
  },
  "err.startInvalid": {
    en: "Start reference invalid: {message}",
    zh: "起始引用无效：{message}",
  },
  "err.endInvalid": {
    en: "End reference invalid: {message}",
    zh: "结束引用无效：{message}",
  },
  "hint.reread": {
    en: "Re-read the file to get fresh hash references.",
    zh: "请重新读取文件以获取新的哈希引用。",
  },
  "hint.moved": {
    en: "Content may have moved. Candidates: {candidates}",
    zh: "内容可能已移动。候选位置：{candidates}",
  },
  "hint.candidate": { en: "line {line}", zh: "第 {line} 行" },

  // Diagnostic labels
  "diag.file": { en: "File:", zh: "文件：" },
  "diag.line": { en: "Line:", zh: "行：" },
  "diag.expectedHash": { en: "Expected hash:", zh: "期望哈希：" },
  "diag.actualHash": { en: "Actual hash:  ", zh: "实际哈希：  " },
  "diag.candidates": { en: "Candidates ({count}):", zh: "候选位置（{count}）：" },
  "diag.candidateLine": { en: "- line {line}: {preview}", zh: "- 第 {line} 行：{preview}" },
  "diag.hint": { en: "Hint:", zh: "提示：" },

  // -------------------------------------------------------------------------
  // Tool errors (hashline-tool.ts)
  // -------------------------------------------------------------------------
  "tool.accessDeniedParent": {
    en: 'Access denied: cannot verify parent directory for "{path}"',
    zh: '访问被拒绝：无法验证 "{path}" 的父目录',
  },
  "tool.accessDeniedOutside": {
    en: 'Access denied: "{path}" resolves outside the project directory',
    zh: '访问被拒绝："{path}" 解析到项目目录之外',
  },
  "tool.readFailed": {
    en: 'Failed to read "{path}": {reason}',
    zh: '读取 "{path}" 失败：{reason}',
  },
  "tool.sizeExceeded": {
    en: 'File "{path}" exceeds the configured maximum size ({size} bytes)',
    zh: '文件 "{path}" 超出配置的最大大小（{size} 字节）',
  },
  "tool.noEdits": {
    en: 'No edits provided for "{path}". Provide an "edits" array, or a single operation/startRef.',
    zh: '未为 "{path}" 提供编辑内容。请提供 "edits" 数组，或单个 operation/startRef。',
  },
  "tool.editFailedDiag": {
    en: 'Hashline edit failed for "{path}":\n{diagnostic}',
    zh: '针对 "{path}" 的哈希编辑失败：\n{diagnostic}',
  },
  "tool.editFailed": {
    en: 'Hashline edit failed for "{path}": {reason}',
    zh: '针对 "{path}" 的哈希编辑失败：{reason}',
  },
  "tool.writeFailed": {
    en: 'Failed to write "{path}": {reason}',
    zh: '写入 "{path}" 失败：{reason}',
  },

  // Tool output
  "tool.applied": {
    en: "Applied {count} edit(s) to {path}.",
    zh: "已对 {path} 应用 {count} 处编辑。",
  },
  "tool.reread": {
    en: "Re-read the file to get fresh hash references before the next edit.",
    zh: "在下一次编辑前，请重新读取文件以获取新的哈希引用。",
  },
  "tool.range": {
    en: "{index}. {operation} {start}-{end}",
    zh: "{index}. {operation} {start}-{end}",
  },
  "tool.metadataTitle": {
    en: "hashline_edit: {count} edit(s) {path}",
    zh: "hashline_edit：{count} 处编辑 {path}",
  },

  // -------------------------------------------------------------------------
  // Tool description & args (hashline-tool.ts)
  // -------------------------------------------------------------------------
  "tool.description": {
    en: "Edit files using hashline references in a single call. Provide an `edits` array (operation + startRef/endRef/replacement each). Refs like 5:a3f or '#HL 5:a3f|...' are resolved without old_string matching. Multiple edits are applied bottom-to-top so they don't shift each other's line numbers.",
    zh: "在一次调用中使用 hashline 引用编辑文件。提供 `edits` 数组（每项含 operation + startRef/endRef/replacement）。如 5:a3f 或 '#HL 5:a3f|...' 的引用无需 old_string 精确匹配即可解析。多个编辑按从下到上顺序应用，因此不会相互造成行号漂移。",
  },
  "arg.path": {
    en: "Path to the file (absolute or relative to project directory)",
    zh: "文件路径（绝对路径，或相对于项目目录的路径）",
  },
  "arg.edits": {
    en: "Batch of edits to apply to the file in one call. Applied bottom-to-top so line references stay valid.",
    zh: "在一次调用中对文件应用的编辑集合。按从下到上顺序应用，使行引用始终有效。",
  },
  "arg.operation": { en: "Edit operation", zh: "编辑操作" },
  "arg.startRef": {
    en: 'Start hash reference, e.g. "5:a3f" or "#HL 5:a3f|const x = 1;"',
    zh: '起始哈希引用，例如 "5:a3f" 或 "#HL 5:a3f|const x = 1;"',
  },
  "arg.endRef": {
    en: "End hash reference for range operations. Defaults to startRef when omitted.",
    zh: "范围操作的结束哈希引用。省略时默认等于 startRef。",
  },
  "arg.replacement": {
    en: "Replacement/inserted content. Required for replace/insert operations.",
    zh: "替换/插入的内容。replace/insert 操作必填。",
  },
  "arg.fileRev": {
    en: "File revision hash (8-char hex from #HL REV:<hash>). When provided, verifies the file hasn't changed before editing.",
    zh: "文件修订号哈希（来自 #HL REV:<hash> 的 8 位十六进制）。提供时会在编辑前校验文件未发生变化。",
  },

  // -------------------------------------------------------------------------
  // System prompt
  // -------------------------------------------------------------------------
  "prompt.system": {
    en: [
      "## Hashline — Line Reference System",
      "",
      "File contents are annotated with hashline prefixes in the format `{prefix}<line>:<hash>|<content>`.",
      "The hash length adapts to file size: 3 chars for files ≤4096 lines, 4 chars for larger files.",
      "",
      "### Example (small file, 3-char hashes):",
      "```",
      "{prefix}1:a3f|function hello() {",
      '{prefix}2:f1c|  return "world";',
      "{prefix}3:0e7|}",
      "```",
      "",
      "### Example (large file, 4-char hashes):",
      "```",
      "{prefix}1:a3f2|import { useState } from 'react';",
      "{prefix}2:f12c|",
      "{prefix}3:0e7a|export function App() {",
      "```",
      "",
      "### How to reference lines:",
      "You can reference specific lines using their hash tags (e.g., `2:f1c` or `2:f12c`).",
      "When editing files, you may include or omit the hash prefixes — they will be stripped automatically.",
      "",
      "### Edit operations using hash references:",
      "",
      "**Preferred tool-based edit (hash-aware):**",
      "- Use the `hashline_edit` tool with an `edits` array — each item has an `operation` plus `startRef` (and optional `endRef` / `replacement`).",
      "- Batch multiple edits to the same file into ONE `hashline_edit` call using the `edits` array.",
      "- All edits are applied against the single read you already have, from bottom to top (descending start line) automatically, so line references do NOT drift between edits and you do NOT need to re-read the file between edits.",
      "- This avoids fragile old_string matching because edits are resolved by hash references.",
      "",
      "**Replace a single line:**",
      '- "Replace line 2:f1c" — target a specific line unambiguously',
      "",
      "**Replace a block of lines:**",
      '- "Replace block from 1:a3f to 3:0e7" — replace a range of lines',
      "- Example: replace lines 1:a3f through 3:0e7 with new content",
      "",
      "**Insert content:**",
      '- "Insert after 3:0e7" — insert new lines after a specific line',
      '- "Insert before 1:a3f" — insert new lines before a specific line',
      "",
      "**Delete lines:**",
      '- "Delete lines from 2:f1c to 3:0e7" — remove a range of lines',
      "",
      "### Hash verification rules:",
      "- **Always verify** that the hash reference matches the current line content before editing.",
      "- If a hash doesn't match, the file may have changed since you last read it — re-read the file first.",
      '- Hash references include both the line number AND the content hash, so `2:f1c` means "line 2 with hash f1c".',
      "- If you see a mismatch, do NOT proceed with the edit — re-read the file to get fresh references.",
      "",
      "### File revision (`{prefix}REV:<hash>`):",
      "- When files are read, the first line may contain a file revision header: `" +
        "{prefix}REV:<8-char-hex>`.",
      "- This is a hash of the entire file content. Pass it as the `fileRev` parameter to `hashline_edit` to verify the file hasn't changed.",
      "- If the file was modified between read and edit, the revision check fails with `FILE_REV_MISMATCH` — re-read the file.",
      "",
      "### Structured error codes:",
      "- `HASH_MISMATCH` — line content changed since last read",
      "- `FILE_REV_MISMATCH` — file was modified since last read",
      "- `TARGET_OUT_OF_RANGE` — line number exceeds file length",
      "- `INVALID_REF` — malformed hash reference",
      "- `INVALID_RANGE` — start line is after end line",
      "- `MISSING_REPLACEMENT` — replace/insert operation without replacement content",
      "",
      "### Best practices:",
      "- Use hash references for all edit operations to ensure precision.",
      "- Batch all edits to the same file into a single `hashline_edit` call with the `edits` array; the tool applies them bottom-to-top so you don't need to re-read between edits.",
      "- For large replacements, use range references (e.g., `1:a3f to 10:b2c`) instead of individual lines.",
      "- Use `fileRev` to guard against stale edits on critical files.",
    ].join("\n"),
    zh: [
      "## Hashline —— 行引用系统",
      "",
      "文件内容以 hashline 前缀注解，格式为 `{prefix}<行号>:<哈希>|<内容>`。",
      "哈希长度随文件大小自适应：文件 ≤4096 行时为 3 位，更大的文件为 4 位。",
      "",
      "### 示例（小文件，3 位哈希）：",
      "```",
      "{prefix}1:a3f|function hello() {",
      '{prefix}2:f1c|  return "world";',
      "{prefix}3:0e7|}",
      "```",
      "",
      "### 示例（大文件，4 位哈希）：",
      "```",
      "{prefix}1:a3f2|import { useState } from 'react';",
      "{prefix}2:f12c|",
      "{prefix}3:0e7a|export function App() {",
      "```",
      "",
      "### 如何引用行：",
      "你可以使用哈希标签引用特定行（例如 `2:f1c` 或 `2:f12c`）。",
      "编辑文件时，可以带或不带哈希前缀——它们会被自动剥离。",
      "",
      "### 使用哈希引用的编辑操作：",
      "",
      "**推荐使用工具化编辑（哈希感知）：**",
      "- 使用 `hashline_edit` 工具，传入 `edits` 数组——每项包含 `operation` 以及 `startRef`（以及可选的 `endRef` / `replacement`）。",
      "- 使用 `edits` 数组，把对同一文件的多次编辑合并到一次 `hashline_edit` 调用中。",
      "- 所有编辑都基于你已经拥有的那一次读取，自动按从下到上（起始行号降序）应用，因此编辑之间行引用不会漂移，也无需在编辑之间重新读取文件。",
      "- 因为编辑通过哈希引用解析，从而避免了脆弱的 old_string 精确匹配。",
      "",
      "**替换单行：**",
      '- "替换第 2:f1c 行" —— 无歧义地定位特定行',
      "",
      "**替换一个行块：**",
      '- "将 1:a3f 到 3:0e7 的行块替换" —— 替换一个行范围',
      "- 示例：将 1:a3f 至 3:0e7 的行替换为新内容",
      "",
      "**插入内容：**",
      '- "在 3:0e7 之后插入" —— 在特定行之后插入新行',
      '- "在 1:a3f 之前插入" —— 在特定行之前插入新行',
      "",
      "**删除行：**",
      '- "删除 2:f1c 到 3:0e7 的行" —— 移除一个行范围',
      "",
      "### 哈希校验规则：",
      "- 编辑前**务必校验**哈希引用与当前行内容是否匹配。",
      "- 若哈希不匹配，说明文件自上次读取后可能已变化——请先重新读取文件。",
      "- 哈希引用同时包含行号和内容哈希，因此 `2:f1c` 表示“内容哈希为 f1c 的第 2 行”。",
      "- 若发现不匹配，请**不要**继续编辑——重新读取文件以获取新的引用。",
      "",
      "### 文件修订号（`{prefix}REV:<hash>`）：",
      "- 读取文件时，首行可能包含文件修订号头：`" + "{prefix}REV:<8 位十六进制>`。",
      "- 这是整个文件内容的哈希。将其作为 `fileRev` 参数传给 `hashline_edit`，以校验文件未发生变化。",
      "- 若读取与编辑之间文件被修改，修订号校验会以 `FILE_REV_MISMATCH` 失败——请重新读取文件。",
      "",
      "### 结构化错误码：",
      "- `HASH_MISMATCH` —— 行内容自上次读取后发生变化",
      "- `FILE_REV_MISMATCH` —— 文件自上次读取后被修改",
      "- `TARGET_OUT_OF_RANGE` —— 行号超出文件长度",
      "- `INVALID_REF` —— 哈希引用格式错误",
      "- `INVALID_RANGE` —— 起始行在结束行之后",
      "- `MISSING_REPLACEMENT` —— replace/insert 操作缺少 replacement 内容",
      "",
      "### 最佳实践：",
      "- 所有编辑操作都使用哈希引用以确保精确。",
      "- 把对同一文件的所有编辑合并到一次 `hashline_edit` 调用的 `edits` 数组中；工具会按从下到上应用，因此无需在编辑之间重新读取。",
      "- 对于大范围替换，使用范围引用（例如 `1:a3f 到 10:b2c`）而不是逐行替换。",
      "- 对关键文件使用 `fileRev` 防止陈旧编辑。",
    ].join("\n"),
  },
};

export type MessageKey = keyof typeof MESSAGES;

/**
 * Translate a message key into the current locale, optionally interpolating
 * `{placeholder}` values.
 */
export function t(key: MessageKey, vars?: InterpVars): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return interpolate(entry[currentLocale], vars);
}

/**
 * Retrieve the raw translation for the given locale (used to build full
 * localized documents such as the system prompt).
 */
export function translate(key: MessageKey, locale: Locale, vars?: InterpVars): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return interpolate(entry[locale], vars);
}

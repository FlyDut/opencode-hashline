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
    en: "Edit files using hashline references in a single call. Provide an `edits` array (operation + startRef/endRef/replacement each). Refs like 5:a3f or '#HL 5:a3f|...' are resolved without old_string matching",
    zh: "在一次调用中使用 hashline 引用编辑文件。提供 `edits` 数组（每项含 operation + startRef/endRef/replacement）。如 5:a3f 或 '#HL 5:a3f|...' 的引用无需 old_string 精确匹配即可解析。",
  },
  "arg.path": {
    en: "Path to the file (absolute or relative to project directory)",
    zh: "文件路径（绝对路径，或相对于项目目录的路径）",
  },
  "arg.edits": {
    en: "Batch of edits to apply to the file in one call. Applied bottom-to-top so line references stay valid.",
    zh: "在一次调用中对文件应用的编辑集合。",
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
      "## Hashline Editing Guide",
      "",
      "When you read a file with `read`, each line is prefixed with `#HL <line>:<hash>`, a line-level content hash annotation. You can use the `hashline_edit` tool to precisely target edits by hash reference, without needing to construct regular expressions or rely on exact string matching.",
      "",
      "**Scenarios where `hashline_edit` is preferred:**",
      "- When using `edit` to replace or delete a code block/function/class that may fail due to whitespace, indentation, or duplicate lines (specify startRef and endRef to define the range)",
      "- When an `edit` replacement might accidentally affect other content",
      "",
      "**Scenarios not suitable for `hashline_edit`:**",
      "- When you need to replace multiple occurrences of the same content – using the `edit` tool is best",
    ].join("\n"),
    zh: [
      "## Hashline 使用指引",
      "",
      "当你用 `read` 读取文件时，每行会带有 `#HL <行号>:<哈希>` 前缀，这是一种行级内容哈希标注。你可以使用 `hashline_edit` 工具通过哈希引用来精确定位编辑目标，既无需构造正则表达式，也不依赖字符串精确匹配。",
      "",
      "**优先使用 `hashline_edit` 的场景：**",
      "- `edit` 替换或删除某个代码块/函数/类，可能因空格/缩进/重复行匹配失败时（指定 startRef 和 endRef 划定范围）",
      "- `edit` 替换可能会误伤其他内容的时候",
      "",
      "**不适合`hashline_edit`的场景：**",
      "- 需要对多处相同内容进行替换，使用 `edit`工具最好",
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

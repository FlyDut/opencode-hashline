/**
 * OpenCode V2 plugin adapter for Hashline.
 *
 * OpenCode 2.0 (beta) uses a different plugin protocol than V1: the module
 * default export must be an object `{ id, setup }` instead of a plugin
 * function. This module implements the `setup` side of the dual-compatible
 * export (see src/index.ts) so the same package works on both:
 *
 * - V1 (1.18+): loader reads `default.server` and calls it with `(input, options)`,
 *   receiving the classic V1 `Hooks` object.
 * - V2: loader validates `default` as an object and calls `default.setup(ctx)`.
 *
 * Behaviors verified against opencode2 0.0.0-next-17403:
 * - `ctx.tool.transform((draft) => draft.add(tool))` registers a tool. The draft
 *   `add` takes a SINGLE object argument `{ name, description, input, execute }`
 *   (the two-argument `add(name, tool)` form from the docs throws in this build).
 * - The read tool result is structured:
 *   `{ output: { type: "file", uri, content, encoding, mime },
 *      content: [{ type: "text", text: "Read file <path>, lines <a>-<b>\nN: <line>..." }],
 *      metadata }`. The model-visible text lives in `content[0].text`.
 * - Edit tools use camelCase args: `{ path, oldString, newString }`.
 * - `ctx.session.hook("context")` exposes `system: Array<{ type: "text", text }>`.
 * - Tool executors receive a context without `directory`/`worktree`/`metadata`
 *   (unlike V1); use `process.cwd()` and the `progress` callback instead.
 */

import { appendFileSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  applyHashEdits,
  computeFileRev,
  formatFileWithHashes,
  getByteLength,
  type HashEditOperation,
  HashlineCache,
  type HashlineConfig,
  HashlineError,
  resolveConfig,
  sanitizeConfig,
  shouldExclude,
  stripHashes,
} from "./hashline";
import { resolveLocale, setLocale, t } from "./i18n";

const CONFIG_FILENAME = "opencode-hashline.json";
const DEBUG_LOG = join(homedir(), ".config", "opencode", "hashline-debug.log");

// ---------------------------------------------------------------------------
// Minimal structural types for the V2 plugin context. We deliberately avoid
// importing `@opencode-ai/plugin` types here so the package keeps building and
// running against the V1 plugin API alone.
// ---------------------------------------------------------------------------

interface V2ReadResult {
  output?: {
    type?: string;
    uri?: string;
    content?: string;
  };
  content?: Array<{ type: string; text: string }>;
}

interface V2ToolEvent {
  tool: string;
  status?: "completed" | "error";
  input?: unknown;
  result?: V2ReadResult;
}

interface V2ContextEvent {
  system?: Array<{ type: string; text: string }>;
}

interface V2ToolContext {
  progress?: (update: Record<string, unknown>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Debug logging (same file and format as the V1 hooks)
// ---------------------------------------------------------------------------

let debugEnabled = false;

function setV2Debug(enabled: boolean) {
  debugEnabled = enabled;
}

function debug(...args: unknown[]) {
  if (!debugEnabled) return;
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  try {
    appendFileSync(DEBUG_LOG, line);
  } catch {}
}

// ---------------------------------------------------------------------------
// Config loading for V2. V2 gives no per-session project directory in the
// plugin context, so project config is resolved against process.cwd()
// (the background service runs from the project directory).
// ---------------------------------------------------------------------------

export function loadV2Config(userConfig?: HashlineConfig): HashlineConfig {
  const globalPath = join(homedir(), ".config", "opencode", CONFIG_FILENAME);
  const projectPath = join(process.cwd(), CONFIG_FILENAME);

  const read = (filePath: string): HashlineConfig | undefined => {
    try {
      return sanitizeConfig(JSON.parse(readFileSync(filePath, "utf-8")));
    } catch {
      return undefined;
    }
  };

  return {
    ...read(globalPath),
    ...read(projectPath),
    ...userConfig,
  };
}

// ---------------------------------------------------------------------------
// File read annotation (V2 structured result)
//
// The V2 read tool's model-visible text looks like:
//   Read file /abs/path, lines 1-3
//   1: line one
//   2: line two
// We rewrite each `N: content` line to the canonical hashline format
// `#HL N:<hash>|content` (identical to the V1 read output), so hashes stay
// compatible with hashline_edit across both versions.
//
// Hashes are computed by `formatFileWithHashes` over the real file slice so
// the adaptive hash length and collision resolution match the V1 behavior
// exactly (a per-line hash would diverge on adaptive length).
// ---------------------------------------------------------------------------

const V2_READ_HEADER_RE = /^Read file (.+), lines (\d+)-(\d+)\n/;

export function annotateV2ReadText(
  text: string,
  config: Required<HashlineConfig>,
  cache?: HashlineCache,
): string {
  const headerMatch = text.match(V2_READ_HEADER_RE);
  if (!headerMatch) return text;
  const [, filePath, startLineStr, endLineStr] = headerMatch;
  const startLine = parseInt(startLineStr, 10);
  const endLine = parseInt(endLineStr, 10);

  const absPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  if (shouldExclude(absPath, config.exclude)) return text;

  // Read the real file content so hashes and the fileRev match hashline_edit.
  let realContent: string;
  try {
    realContent = readFileSync(absPath, "utf-8");
  } catch {
    return text;
  }
  if (config.maxFileSize > 0 && getByteLength(realContent) > config.maxFileSize) return text;

  if (cache) {
    const cached = cache.get(absPath, realContent);
    if (cached) {
      debug("read annotated (cached):", absPath);
      return cached;
    }
  }

  const hashLen = config.hashLength || 0;
  const prefix = config.prefix;
  const fileRevHash = config.fileRev ? computeFileRev(realContent) : undefined;
  const realLines = realContent.split("\n");

  // Annotate the visible slice (startLine..endLine) with formatFileWithHashes,
  // then index the result by line number for a line-by-line rewrite below.
  const slice = realLines.slice(startLine - 1, endLine).join("\n");
  const block = formatFileWithHashes(
    slice,
    hashLen || undefined,
    prefix,
    config.fileRev,
    startLine,
    fileRevHash,
  ).split("\n");
  const revLine = config.fileRev ? block.shift() : undefined;
  const annotatedByLine = new Map<number, string>();
  for (const line of block) {
    // Strip the prefix (e.g. "#HL ") before matching the "N:hash|" shape.
    const raw =
      prefix === false ? line : line.startsWith(prefix) ? line.slice(prefix.length) : line;
    const match = raw.match(/^(\d+):([0-9a-f]{2,8})\|/);
    if (match) {
      annotatedByLine.set(parseInt(match[1], 10), line);
    }
  }

  const bodyLines = text.slice(headerMatch[0].length).split("\n");
  const rewritten = bodyLines.map((line) => {
    const match = line.match(/^(\d+): ([\s\S]*)$/);
    if (match) {
      const replacement = annotatedByLine.get(parseInt(match[1], 10));
      if (replacement !== undefined) return replacement;
    }
    return line;
  });

  const annotated = headerMatch[0] + (revLine ? `${revLine}\n` : "") + rewritten.join("\n");
  if (cache) {
    cache.set(absPath, realContent, annotated);
  }
  debug("read annotated:", absPath, "lines:", bodyLines.length);
  return annotated;
}

// ---------------------------------------------------------------------------
// Edit argument hash stripping (V2 camelCase fields)
// ---------------------------------------------------------------------------

const V2_EDIT_TOOLS = [
  "edit",
  "write",
  "file_write",
  "file_edit",
  "edit_file",
  "patch",
  "apply_patch",
  "multiedit",
  "batch",
];

const V2_CONTENT_FIELDS = new Set([
  "content",
  "new_content",
  "old_content",
  "old_string",
  "new_string",
  "oldString",
  "newString",
  "oldContent",
  "newContent",
  "replacement",
  "text",
  "diff",
  "patch",
  "patchText",
  "body",
]);

export function stripHashFields(obj: Record<string, unknown>, prefix: string | false): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && V2_CONTENT_FIELDS.has(key)) {
      obj[key] = stripHashes(val, prefix);
    }
  }
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          stripHashFields(item as Record<string, unknown>, prefix);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// hashline_edit tool (V2 form)
//
// Registers the same tool as V1 but with a JSON-Schema input and a V2-style
// executor: no `directory`/`worktree`/`metadata` in the context, so paths are
// resolved against process.cwd() and progress updates go through `progress`.
// ---------------------------------------------------------------------------

export function createV2EditTool(config: Required<HashlineConfig>, cache?: HashlineCache) {
  return {
    name: "hashline_edit",
    description: t("tool.description"),
    input: {
      type: "object",
      properties: {
        path: { type: "string", description: t("arg.path") },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                enum: ["replace", "delete", "insert_before", "insert_after"],
              },
              startRef: { type: "string" },
              endRef: { type: "string" },
              replacement: { type: "string", maxLength: 10_000_000 },
            },
            required: ["operation", "startRef"],
            additionalProperties: false,
          },
        },
        fileRev: { type: "string" },
      },
      required: ["path", "edits"],
      additionalProperties: false,
    },
    async execute(args: Record<string, unknown>, context: V2ToolContext) {
      const {
        path: filePathArg,
        edits: batchEdits,
        fileRev,
      } = args as {
        path: string;
        edits?: Array<{
          operation: HashEditOperation;
          startRef: string;
          endRef?: string;
          replacement?: string;
        }>;
        fileRev?: string;
      };

      // V2 provides no session directory in the tool context; resolve relative
      // paths against the working directory of the OpenCode service.
      const cwd = process.cwd();
      const absPath = isAbsolute(filePathArg) ? filePathArg : resolve(cwd, filePathArg);
      const realDirectory = realpathSync(cwd);

      function isWithin(filePath: string, dir: string): boolean {
        if (dir === sep) return false;
        return filePath === dir || filePath.startsWith(dir + sep);
      }

      let realAbs: string;
      try {
        realAbs = realpathSync(absPath);
      } catch {
        const parentDir = dirname(absPath);
        let realParent: string;
        try {
          realParent = realpathSync(parentDir);
        } catch {
          throw new Error(t("tool.accessDeniedParent", { path: filePathArg }));
        }
        if (!isWithin(realParent, realDirectory)) {
          throw new Error(t("tool.accessDeniedOutside", { path: filePathArg }));
        }
        realAbs = resolve(absPath);
      }

      if (!isWithin(realAbs, realDirectory)) {
        throw new Error(t("tool.accessDeniedOutside", { path: filePathArg }));
      }
      const displayPath = relative(cwd, absPath) || filePathArg;

      let current: string;
      try {
        current = readFileSync(realAbs, "utf-8");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(t("tool.readFailed", { path: displayPath, reason }));
      }

      if (config.maxFileSize > 0 && getByteLength(current) > config.maxFileSize) {
        throw new Error(t("tool.sizeExceeded", { path: displayPath, size: config.maxFileSize }));
      }

      if (!Array.isArray(batchEdits) || batchEdits.length === 0) {
        throw new Error(t("tool.noEdits", { path: displayPath }));
      }

      const edits = batchEdits.map((e) => ({
        operation: e.operation,
        startRef: e.startRef,
        endRef: e.endRef,
        replacement: e.replacement,
        fileRev,
      }));

      let result: ReturnType<typeof applyHashEdits>;
      try {
        result = applyHashEdits(edits, current, config.hashLength || undefined);
      } catch (error) {
        if (error instanceof HashlineError) {
          throw new Error(
            t("tool.editFailedDiag", { path: displayPath, diagnostic: error.toDiagnostic() }),
          );
        }
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(t("tool.editFailed", { path: displayPath, reason }));
      }

      try {
        writeFileSync(realAbs, result.content, "utf-8");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(t("tool.writeFailed", { path: displayPath, reason }));
      }

      if (cache) {
        cache.invalidate(realAbs);
      }

      const ranges = result.edits
        .map((e, i) =>
          t("tool.range", {
            index: i + 1,
            operation: e.operation,
            start: e.startLine,
            end: e.endLine,
          }),
        )
        .join("\n");

      try {
        await context.progress?.({
          title: t("tool.metadataTitle", { count: edits.length, path: displayPath }),
          metadata: {
            path: displayPath,
            count: edits.length,
            edits: result.edits.map((e) => ({
              operation: e.operation,
              startLine: e.startLine,
              endLine: e.endLine,
            })),
          },
        });
      } catch {}

      return {
        content: [
          t("tool.applied", { count: edits.length, path: displayPath }),
          ranges,
          t("tool.reread"),
        ].join("\n"),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// V2 setup
// ---------------------------------------------------------------------------

export interface V2ContextLike {
  options?: Record<string, unknown>;
  tool: {
    transform: (
      fn: (draft: { add: (...args: unknown[]) => void }) => void | Promise<void>,
    ) => Promise<unknown>;
    hook: (
      name: "execute.before" | "execute.after",
      fn: (event: V2ToolEvent) => void,
    ) => Promise<unknown>;
  };
  session: {
    hook: (name: "context", fn: (event: V2ContextEvent) => void) => Promise<unknown>;
  };
}

/**
 * Create the V2 `setup` function for the dual-compatible plugin export.
 *
 * Registers hashline_edit, annotates read output, strips hashes from edit
 * arguments, and injects the system prompt — mirroring the V1 hooks.
 *
 * @param userConfig - optional programmatic config (used before ctx.options)
 */
export function createV2Setup(userConfig?: HashlineConfig) {
  return async (ctx: V2ContextLike): Promise<void> => {
    const fileConfig = loadV2Config(userConfig ?? (ctx.options as HashlineConfig | undefined));
    const config = resolveConfig(fileConfig);
    setLocale(resolveLocale(config.locale));
    setV2Debug(config.debug);
    const cache = new HashlineCache(config.cacheSize);

    debug(
      "v2 setup: plugin loaded, prefix:",
      JSON.stringify(config.prefix),
      "maxFileSize:",
      config.maxFileSize,
    );

    // Register the hashline_edit tool. The draft `add` signature changed across
    // opencode2 beta builds: next-17403 takes a single object argument
    // `add(tool)`, while newer builds (and the docs) take `add(name, tool)`.
    // Inspect the function's arity and call the matching form so both work.
    await ctx.tool.transform((draft) => {
      const toolDef = createV2EditTool(config, cache);
      if (draft.add.length >= 2) {
        draft.add(toolDef.name, toolDef);
      } else {
        draft.add(toolDef);
      }
    });
    debug("v2 setup: tool registered");

    // Annotate file-read output with #HL line hashes.
    await ctx.tool.hook("execute.after", (event) => {
      try {
        if (event.tool !== "read" || event.status !== "completed") return;
        const result = event.result;
        if (!result || !Array.isArray(result.content)) return;
        for (const part of result.content) {
          if (part.type !== "text" || typeof part.text !== "string") continue;
          const annotated = annotateV2ReadText(part.text, config, cache);
          if (annotated !== part.text) {
            part.text = annotated;
          }
        }
      } catch (e) {
        debug("read annotation error:", e);
      }
    });

    // Strip hashline prefixes from edit tool arguments before they apply.
    await ctx.tool.hook("execute.before", (event) => {
      try {
        const toolName = event.tool.toLowerCase();
        const isEdit = V2_EDIT_TOOLS.some(
          (name) => toolName === name || toolName.endsWith(`.${name}`),
        );
        if (!isEdit) return;
        if (!event.input || typeof event.input !== "object") return;
        stripHashFields(event.input as Record<string, unknown>, config.prefix);
      } catch (e) {
        debug("edit strip error:", e);
      }
    });

    // Inject the hashline usage instructions into the session system prompt.
    await ctx.session.hook("context", (event) => {
      try {
        const prefix = config.prefix === false ? "" : config.prefix;
        event.system?.push({ type: "text", text: t("prompt.system", { prefix }) });
      } catch (e) {
        debug("system prompt error:", e);
      }
    });
    debug("v2 setup: hooks registered");
  };
}

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ToolContext } from "@opencode-ai/plugin";
import { z } from "zod";
import {
  applyHashEdits,
  getByteLength,
  type HashEditInput,
  type HashEditOperation,
  type HashlineCache,
  type HashlineConfig,
  HashlineError,
} from "./hashline";
import { t } from "./i18n";

/**
 * Hash-aware batch edit tool.
 *
 * Applies one or more edits by hash references (line+hash) in a single call,
 * avoiding fragile exact old_string matching. When multiple edits are supplied,
 * they are applied from bottom to top (descending start line) inside the tool,
 * so consecutive edits do not suffer from line-number drift and the file only
 * needs to be read once.
 */
export function createHashlineEditTool(config: Required<HashlineConfig>, cache?: HashlineCache) {
  return {
    description: t("tool.description"),
    args: {
      path: z.string().describe(t("arg.path")),
      edits: z
        .array(
          z.object({
            operation: z
              .enum(["replace", "delete", "insert_before", "insert_after"])
              .describe(t("arg.operation")),
            startRef: z.string().describe(t("arg.startRef")),
            endRef: z.string().optional().describe(t("arg.endRef")),
            replacement: z.string().max(10_000_000).optional().describe(t("arg.replacement")),
          }),
        )
        .describe(t("arg.edits")),
      fileRev: z.string().optional().describe(t("arg.fileRev")),
    },
    async execute(args: Record<string, unknown>, context: ToolContext) {
      const {
        path,
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
      const absPath = isAbsolute(path) ? path : resolve(context.directory, path);
      const realDirectory = realpathSync(resolve(context.directory));
      const realWorktree = realpathSync(resolve(context.worktree));

      // Mirror OpenCode's Instance.containsPath logic:
      // For non-git projects, worktree is set to "/" — skip worktree check
      // in that case, as it would match any absolute path.
      // On Windows also block bare drive roots ("C:\") and UNC roots ("\\server\share").
      function isWithin(filePath: string, dir: string): boolean {
        if (dir === sep) return false;
        if (process.platform === "win32") {
          if (/^[A-Za-z]:\\$/.test(dir)) return false;
          if (/^\\\\[^\\]+\\[^\\]+$/.test(dir)) return false;
        }
        return filePath === dir || filePath.startsWith(dir + sep);
      }

      // Use realpathSync to resolve symlinks — prevents symlink-based traversal.
      // For new (non-existent) files, verify the parent directory instead.
      let realAbs: string;
      try {
        realAbs = realpathSync(absPath);
      } catch {
        // File doesn't exist yet — verify parent directory is within project
        // to prevent symlink-based traversal via intermediate path components.
        const parentDir = dirname(absPath);
        let realParent: string;
        try {
          realParent = realpathSync(parentDir);
        } catch {
          throw new Error(t("tool.accessDeniedParent", { path }));
        }
        if (!isWithin(realParent, realDirectory) && !isWithin(realParent, realWorktree)) {
          throw new Error(t("tool.accessDeniedOutside", { path }));
        }
        realAbs = resolve(absPath);
      }

      if (!isWithin(realAbs, realDirectory) && !isWithin(realAbs, realWorktree)) {
        throw new Error(t("tool.accessDeniedOutside", { path }));
      }
      const displayPath = relative(context.worktree, absPath) || path;

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

      // The tool is batch-only: edits are always supplied via the `edits` array.
      if (!Array.isArray(batchEdits) || batchEdits.length === 0) {
        throw new Error(t("tool.noEdits", { path: displayPath }));
      }
      const edits: HashEditInput[] = batchEdits.map((e) => ({
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

      context.metadata({
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

      return [
        t("tool.applied", { count: edits.length, path: displayPath }),
        ranges,
        t("tool.reread"),
      ].join("\n");
    },
  };
}

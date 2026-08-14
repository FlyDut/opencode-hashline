/**
 * opencode-hashline — Hashline plugin for OpenCode
 *
 * Content-addressable line hashing for precise AI code editing.
 * When the AI reads a file, each line is annotated with a short hash tag.
 * When the AI edits a file, hash prefixes are automatically stripped.
 *
 * IMPORTANT: OpenCode's plugin loader calls every export as a Plugin function.
 * Only Plugin-compatible exports belong here. For utility functions and
 * constants, import from "opencode-hashline/utils".
 */

import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "@opencode-ai/plugin";
import { HashlineCache, type HashlineConfig, resolveConfig, sanitizeConfig } from "./hashline";
import { createHashlineEditTool } from "./hashline-tool";
import {
  createFileEditBeforeHook,
  createFileReadAfterHook,
  createSystemPromptHook,
  setDebug,
} from "./hooks";
import { resolveLocale, setLocale } from "./i18n";
import { createV2Setup } from "./v2";

const CONFIG_FILENAME = "opencode-hashline.json";

// Module-level temp directory registry — a single exit listener shared by all instances.
// Each instance creates a private subdirectory; on exit we remove them all.
const tempDirs = new Set<string>();
let exitListenerRegistered = false;

function registerTempDir(dir: string): void {
  tempDirs.add(dir);
  if (!exitListenerRegistered) {
    exitListenerRegistered = true;
    process.on("exit", () => {
      for (const d of tempDirs) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    });
  }
}

/**
 * Write content to a temp file inside a private directory with exclusive creation.
 * Returns the absolute path to the created file.
 */
function writeTempFile(tempDir: string, content: string): string {
  const name = `hl-${randomBytes(16).toString("hex")}.txt`;
  const tmpPath = join(tempDir, name);
  writeFileSync(tmpPath, content, "utf-8");
  return tmpPath;
}

/**
 * Sanitize and validate a raw parsed config object.
 * Accepts only known keys with expected types; silently drops invalid values.
 * This prevents prototype pollution, type confusion, and prompt injection via
 * a malicious or hand-crafted config file.
 *
 * Re-exported from ./hashline so the V1 and V2 adapters share one implementation
 * without circular imports.
 */
export { sanitizeConfig } from "./hashline";

/**
 * Try to read and parse a JSON config file. Returns undefined if not found.
 */
function loadConfigFile(filePath: string): HashlineConfig | undefined {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/**
 * Load config from known locations.
 *
 * Priority (later overrides earlier):
 *   1. ~/.config/opencode/opencode-hashline.json  (global)
 *   2. <project>/opencode-hashline.json           (project-local)
 *   3. programmatic userConfig                     (factory arg)
 */
function loadConfig(projectDir?: string, userConfig?: HashlineConfig): HashlineConfig {
  const globalPath = join(homedir(), ".config", "opencode", CONFIG_FILENAME);
  const globalConfig = loadConfigFile(globalPath);

  let projectConfig: HashlineConfig | undefined;
  if (projectDir) {
    projectConfig = loadConfigFile(join(projectDir, CONFIG_FILENAME));
  }

  return {
    ...globalConfig,
    ...projectConfig,
    ...userConfig,
  };
}

interface PluginInput {
  directory?: string;
  worktree?: string;
}

/**
 * Create a Hashline plugin instance with optional user configuration.
 *
 * Config is loaded from (in priority order):
 *   1. ~/.config/opencode/opencode-hashline.json  (global)
 *   2. <project>/opencode-hashline.json           (project-local)
 *   3. Programmatic config passed to this factory
 *
 * Usage in opencode.json (default config):
 * ```json
 * { "plugin": ["opencode-hashline"] }
 * ```
 *
 * For custom config, use the factory:
 * ```ts
 * import { createHashlinePlugin } from "opencode-hashline";
 * export default createHashlinePlugin({ maxFileSize: 2_000_000 });
 * ```
 *
 * @param userConfig - optional Hashline configuration overrides
 * @returns an OpenCode Plugin function
 */
export function createHashlinePlugin(userConfig?: HashlineConfig): Plugin {
  return async (input) => {
    const { directory: projectDir, worktree } = input as PluginInput;
    const fileConfig = loadConfig(projectDir, userConfig);
    const config = resolveConfig(fileConfig);
    const cache = new HashlineCache(config.cacheSize);

    // Apply locale globally (module state) so tools/hooks/errors localize.
    setLocale(resolveLocale(config.locale));

    // Enable debug logging only if config.debug is true
    setDebug(config.debug);
    const debugLog = join(homedir(), ".config", "opencode", "hashline-debug.log");
    const writeLog = appendFileSync;
    if (config.debug) {
      try {
        writeLog(
          debugLog,
          `[${new Date().toISOString()}] plugin loaded, prefix: ${JSON.stringify(config.prefix)}, maxFileSize: ${config.maxFileSize}, projectDir: ${projectDir}\n`,
        );
      } catch {}
    }

    // Create a private temp directory for this instance; cleaned up on process exit.
    const instanceTmpDir = mkdtempSync(join(tmpdir(), "hashline-"));
    registerTempDir(instanceTmpDir);

    return {
      tool: {
        hashline_edit: createHashlineEditTool(config, cache),
      },
      "tool.execute.after": createFileReadAfterHook(cache, config),
      "tool.execute.before": createFileEditBeforeHook(config),
      "experimental.chat.system.transform": createSystemPromptHook(config),
      "chat.message": async (_input: unknown, output: unknown) => {
        try {
          const out = output as {
            message?: unknown;
            parts?: { type?: string; url?: string; mime?: string }[];
          };
          const hashLen = config.hashLength || 0;
          const prefix = config.prefix;
          const { formatFileWithHashes, shouldExclude, getByteLength } = await import("./hashline");

          for (const p of out.parts ?? []) {
            if (p.type !== "file") continue;
            if (!p.url || !p.mime?.startsWith("text/")) continue;

            // Get file path from url (file:///...) or source.path
            let filePath: string | undefined;
            if (typeof p.url === "string" && p.url.startsWith("file://")) {
              filePath = fileURLToPath(p.url);
            }
            if (!filePath) continue;

            // Worktree boundary check — only process files within the project
            if (worktree) {
              try {
                const realFile = realpathSync(filePath);
                const realWorktree = realpathSync(resolve(worktree));
                if (realFile !== realWorktree && !realFile.startsWith(realWorktree + sep)) {
                  continue;
                }
              } catch {
                continue;
              }
            }

            // Check exclusions
            if (shouldExclude(filePath, config.exclude)) continue;

            // Read and check size
            let content: string;
            try {
              content = readFileSync(filePath, "utf-8");
            } catch {
              continue;
            }

            if (config.maxFileSize > 0 && getByteLength(content) > config.maxFileSize) continue;

            // Check cache
            const cached = cache.get(filePath, content);
            if (cached) {
              // Write annotated content to temp file and swap URL
              const tmpPath = writeTempFile(instanceTmpDir, cached);
              p.url = `file://${tmpPath}`;
              if (config.debug) {
                try {
                  writeLog(
                    debugLog,
                    `[${new Date().toISOString()}] chat.message annotated (cached): ${filePath}\n`,
                  );
                } catch {}
              }
              continue;
            }

            // Annotate
            const annotated = formatFileWithHashes(
              content,
              hashLen || undefined,
              prefix,
              config.fileRev,
            );
            cache.set(filePath, content, annotated);

            // Write to temp file and swap URL
            const tmpPath = writeTempFile(instanceTmpDir, annotated);
            p.url = `file://${tmpPath}`;

            if (config.debug) {
              try {
                writeLog(
                  debugLog,
                  `[${new Date().toISOString()}] chat.message annotated: ${filePath} lines=${content.split("\n").length}\n`,
                );
              } catch {}
            }
          }
        } catch (e) {
          if (config.debug) {
            try {
              writeLog(debugLog, `[${new Date().toISOString()}] chat.message error: ${e}\n`);
            } catch {}
          }
        }
      },
    };
  };
}

/**
 * Hashline plugin for OpenCode (default instance with default config).
 *
 * Named export following the OpenCode V1 plugin convention:
 * @see https://opencode.ai/docs/plugins/
 */
export const HashlinePlugin: Plugin = createHashlinePlugin();

// ---------------------------------------------------------------------------
// Dual-compatible export (V1 + V2)
//
// OpenCode 1.18+ and OpenCode 2.0 load plugins through the module default
// export, but they expect different shapes:
//
// - V1 (1.18+): `readV1Plugin` accepts an object `{ id, server }` and calls
//   `server(input, options)` to obtain the classic Hooks object.
// - V2: the loader validates `default` as an object and calls `setup(ctx)`;
//   unknown extra fields (such as `server`) are tolerated.
//
// Exporting both keys on one object lets the same package work on both
// runtimes. Older V1 releases (before the object form) are not supported;
// use V1.18 or newer.
// ---------------------------------------------------------------------------

export default {
  id: "flydut.opencode-hashline",
  /** V1 plugin entrypoint: (input, options) => Promise<Hooks> */
  server: HashlinePlugin,
  /** V2 plugin entrypoint: (ctx) => Promise<void> */
  setup: createV2Setup(),
};

// Re-export types only (types are erased at runtime, so they don't
// create callable exports that would confuse OpenCode's plugin loader)
export type {
  CandidateLine,
  HashEditInput,
  HashEditOperation,
  HashEditResult,
  HashlineConfig,
  HashlineErrorCode,
  ResolvedRange,
  VerifyHashResult,
} from "./hashline";

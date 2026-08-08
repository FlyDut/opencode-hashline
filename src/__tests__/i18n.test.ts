import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../hashline";
import { createHashlineEditTool } from "../hashline-tool";
import { createSystemPromptHook } from "../hooks";
import { getLocale, resolveLocale, setLocale, t, translate } from "../i18n";

function makeTool() {
  return createHashlineEditTool(resolveConfig(), undefined);
}

function makeTempContext(): { context: ToolContext; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "hashline-i18n-"));
  writeFileSync(join(dir, "a.ts"), "#HL 1:aaaa|const x = 1;\n", "utf-8");
  const context = { directory: dir, worktree: dir } as unknown as ToolContext;
  return { context, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

afterEach(() => {
  setLocale("en");
});

describe("resolveLocale", () => {
  it("defaults to English for undefined / unknown", () => {
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("jp")).toBe("en");
  });

  it("recognizes Chinese variants", () => {
    expect(resolveLocale("zh")).toBe("zh");
    expect(resolveLocale("zh-CN")).toBe("zh");
    expect(resolveLocale("zh_CN")).toBe("zh");
    expect(resolveLocale("zh-TW")).toBe("zh");
    expect(resolveLocale("ZH")).toBe("zh");
  });
});

describe("t / setLocale", () => {
  it("returns English by default", () => {
    expect(getLocale()).toBe("en");
    expect(t("tool.applied", { count: 1, path: "a.ts" })).toContain("Applied 1 edit");
  });

  it("returns Chinese after setLocale('zh')", () => {
    setLocale("zh");
    expect(getLocale()).toBe("zh");
    expect(t("tool.applied", { count: 1, path: "a.ts" })).toContain("已对");
  });

  it("interpolates placeholders", () => {
    expect(t("err.revMismatch", { expected: "abc", actual: "xyz" })).toContain('"abc"');
    expect(t("err.revMismatch", { expected: "abc", actual: "xyz" })).toContain('"xyz"');
  });

  it("falls back to key for unknown keys", () => {
    // @ts-expect-error intentionally unknown key
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
});

describe("translate", () => {
  it("returns the requested locale regardless of current locale", () => {
    setLocale("zh");
    expect(translate("hint.reread", "en")).toContain("Re-read the file");
    expect(translate("hint.reread", "zh")).toContain("重新读取文件");
  });
});

describe("localized tool", () => {
  it("has an English description by default", () => {
    const tool = makeTool();
    expect(tool.description).toContain("Edit files using hashline references");
    expect(tool.description).not.toContain("哈希");
  });

  it("has a Chinese description after setLocale('zh')", () => {
    setLocale("zh");
    const zhTool = makeTool();
    expect(zhTool.description).toContain("行号漂移");
  });

  it("localizes tool output when locale is zh", async () => {
    setLocale("zh");
    const zhTool = makeTool();
    const { context, cleanup } = makeTempContext();
    try {
      await expect(zhTool.execute({ path: "a.ts" }, context)).rejects.toThrow(
        /未为 "a\.ts" 提供编辑内容/,
      );
    } finally {
      cleanup();
    }
  });
});

describe("localized system prompt", () => {
  it("contains English by default", async () => {
    const hook = createSystemPromptHook();
    const output: { system: string[] } = { system: [] };
    await hook({} as never, output);
    expect(output.system.join("\n")).toContain("Hashline — Line Reference System");
  });

  it("contains Chinese after setLocale('zh')", async () => {
    setLocale("zh");
    const hook = createSystemPromptHook();
    const output: { system: string[] } = { system: [] };
    await hook({} as never, output);
    expect(output.system.join("\n")).toContain("行引用系统");
  });

  it("substitutes the configured prefix", async () => {
    const hook = createSystemPromptHook();
    const output: { system: string[] } = { system: [] };
    await hook({} as never, output);
    expect(output.system.join("\n")).toContain("#HL");
  });
});

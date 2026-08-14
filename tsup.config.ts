import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "opencode-hashline": "src/index.ts", utils: "src/utils.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "esnext",
  outDir: "dist",
  // zod is bundled so the V2 loader can run the plugin without installing
  // dependencies (V2 imports local plugins directly; @opencode-ai/plugin and
  // @opencode-ai/sdk stay external because they are type-only imports).
  external: ["@opencode-ai/plugin", "@opencode-ai/sdk"],
  noExternal: ["zod"],
});

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const localEnv = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), "");

if (localEnv.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = localEnv.GEMINI_API_KEY;
}

export default defineConfig({
  nitro: true,

  tanstackStart: {
    server: {
      entry: "server",
    },
  },
});

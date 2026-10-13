import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 僅執行 TypeScript 原始測試，避免掃描 dist/ 內的編譯副本。
    include: ["tests/**/*.test.ts"]
  }
});

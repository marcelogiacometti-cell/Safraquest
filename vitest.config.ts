import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { environment: 'node', fileParallelism: false, hookTimeout: 30000, testTimeout: 30000, setupFiles: ['./tests/setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});

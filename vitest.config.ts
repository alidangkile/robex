import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Keep discovery to the repo's own tests: never scan Playwright MCP
    // scratch output, QA worktrees or build output.
    exclude: [...configDefaults.exclude, '**/.playwright-mcp/**', '**/dist/**', '**/qa-worktree/**'],
  },
});

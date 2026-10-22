// Web smoke test of the real app bundle in FakeApi mode (EXPO_PUBLIC_HEARTH_FAKE=1).
const { defineConfig } = require('../../e2e/node_modules/@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  testIgnore: /(demo|site)\.spec\.js/, // the demo builds have their own configs (playwright.demo / .site)
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../test-results/e2e-web.json' }]],
  outputDir: '../test-results/e2e-web-artifacts',
  use: { baseURL: 'http://127.0.0.1:8089', viewport: { width: 360, height: 740 }, hasTouch: true },
  webServer: { command: 'node scripts/serve-dist.js dist-fake 8089', cwd: '..', url: 'http://127.0.0.1:8089', reuseExistingServer: false },
});

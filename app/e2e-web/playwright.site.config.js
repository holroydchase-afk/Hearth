// DEMO-5 (RR-5): the demo as it will be hosted, under /demo/hearth/ on a static host with no fallback.
// Build first: bash scripts/build-demo.sh
const { defineConfig } = require('../../e2e/node_modules/@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  testMatch: /site\.spec\.js/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: '../test-results/e2e-site-artifacts',
  use: { baseURL: 'http://127.0.0.1:8091', viewport: { width: 390, height: 844 }, hasTouch: true },
  webServer: { command: 'node scripts/serve-static.js dist-demo-site 8091 /demo/hearth', cwd: '..', url: 'http://127.0.0.1:8091/demo/hearth/', reuseExistingServer: false },
});

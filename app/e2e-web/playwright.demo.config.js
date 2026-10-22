// The no-login sample-data demo build (EXPO_PUBLIC_HEARTH_DEMO=1), served from dist-demo.
const { defineConfig } = require('../../e2e/node_modules/@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  testMatch: /demo(-screens)?\.spec\.js/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: '../test-results/e2e-demo-artifacts',
  use: { baseURL: 'http://127.0.0.1:8090', viewport: { width: 390, height: 844 }, hasTouch: true },
  webServer: { command: 'node scripts/serve-dist.js dist-demo 8090', cwd: '..', url: 'http://127.0.0.1:8090', reuseExistingServer: false },
});

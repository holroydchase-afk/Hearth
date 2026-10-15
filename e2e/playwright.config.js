// Hearth prototype end-to-end tests. Run: npx playwright test
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  fullyParallel: true,
  reporter: [['list'], ['json', { outputFile: 'results/latest.json' }]],
  use: {
    viewport: { width: 390, height: 844 },   // iPhone 14/15 size
    hasTouch: true,
  },
});

// REAL-1: jest-expo (SDK 58) replaces the global fetch with Expo's native-only fetch during setup.
// Keep Node's own network fetch for the real-API contract run (src/api/contract/supabaseHarness.ts).
const ExpoEnvironment = require('jest-expo/src/preset/nativeEnvironment.js');

class HearthEnvironment extends ExpoEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__hearthNodeFetch = globalThis.fetch;
  }
}

module.exports = HearthEnvironment;

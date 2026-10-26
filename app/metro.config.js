// The messenger lives outside app/ as a shared library (../packages/messenger, linked by npm as
// @holroyd/messenger). Metro must watch that folder, and the library's imports (ts-mls, @noble) resolve from
// app/node_modules, where npm installed them.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../packages/messenger')];
config.resolver.nodeModulesPaths = [...(config.resolver.nodeModulesPaths ?? []), path.resolve(__dirname, 'node_modules')];
module.exports = config;

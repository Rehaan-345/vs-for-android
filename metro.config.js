// metro.config.js

const { getDefaultConfig } = require('expo/metro-config');

// Get the default Expo config
const config = getDefaultConfig(__dirname);

// Add a custom asset extension for files with no extension (like those in vs/)
config.resolver.assetExts.push(
    // Add '' (empty string) to support files without extensions
    '' 
);

// Note: You might also need to explicitly exclude 'js' if the file is truly extensionless
// but in most cases, just adding '' is enough for Monaco Editor files.

module.exports = config;
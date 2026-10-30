// O contrato da ponte web↔casca mora na web (../src/lib/native-app/bridge-contract.ts) e é importado
// daqui, para os dois lados não divergirem. O Metro só enxerga a pasta do projeto sem watchFolders.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../src/lib/native-app")];
module.exports = config;

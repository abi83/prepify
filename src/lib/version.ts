import pkg from "@/../package.json"

const buildSuffix = process.env.BUILD_SUFFIX

export const APP_VERSION = buildSuffix ? `${pkg.version}+${buildSuffix}` : pkg.version

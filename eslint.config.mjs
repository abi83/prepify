import nextConfig from "eslint-config-next"

const config = [
  {
    ignores: [
      ".claude/**",
      ".next/**",
      "node_modules/**",
      "src/generated/**",
      "coverage/**",
    ],
  },
  ...nextConfig,
  {
    rules: {
      "import/order": [
        "error",
        {
          groups: [ "builtin", "external", "internal" ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
            },
          ],
          pathGroupsExcludedImportTypes: [ "builtin" ],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
          "newlines-between": "always",
        },
      ],
    },
  },
  {
    rules: {
      indent: [ "error", 2 ],
      "no-multi-spaces": [ "error" ],
      "array-bracket-spacing": [ "error", "always" ],
      "object-curly-spacing": [ "error", "always" ],
      "arrow-spacing": [ "error", { before: true, after: true } ],
      semi: [ "error", "never" ],
      quotes: [ "error", "double" ],
      "no-trailing-spaces": "error",
      "eol-last": [ "error", "always" ],
      "space-before-blocks": [ "error", "always" ],
      "no-multiple-empty-lines": [ "error", { max: 1, maxEOF: 1 } ],
    },
  },
  {
    files: [ "**/*.ts", "**/*.tsx" ],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
        },
      ],
    },
  },
]

export default config

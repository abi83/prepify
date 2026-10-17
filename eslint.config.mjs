import nextConfig from "eslint-config-next"

const noParentImports = {
  rules: {
    "no-parent-imports": {
      create(context) {
        const check = (node, value) => {
          if (typeof value === "string" && value.startsWith("../")) {
            context.report({ node, message: "Use @/ alias instead of relative parent imports." })
          }
        }
        return {
          ImportDeclaration(node) { check(node, node.source.value) },
          ExportNamedDeclaration(node) { if (node.source) check(node, node.source.value) },
          ImportExpression(node) { if (node.source.type === "Literal") check(node, node.source.value) },
        }
      },
    },
  },
}

const runtimeAgnosticPatterns = [
  { group: [ "next", "next/*" ], message: "Runtime-agnostic code must not depend on Next." },
  { group: [ "@prisma/client", "@prisma/client/*" ], message: "Runtime-agnostic code must not depend on Prisma." },
  { group: [ "@/repositories", "@/repositories/*" ], message: "Runtime-agnostic code must persist through the Store." },
  { group: [ "@/actions", "@/actions/*" ], message: "Runtime-agnostic code must persist through the Store." },
  { group: [ "openai", "openai/*" ], message: "Runtime-agnostic code must call models through the Llm port." },
]

const layerPattern = (layer, message) => ({ group: [ `@/${layer}`, `@/${layer}/*` ], message })

const noImports = patterns => [ "error", { patterns } ]

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
    plugins: { local: noParentImports },
    rules: { "local/no-parent-imports": "error" },
  },
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
            {
              pattern: "@evals/**",
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
    // Runtime-agnostic code: runs in a browser worker, a server, or a CLI.
    files: [
      "src/cli/**/*.ts",
      "src/core/**/*.ts",
      "src/lib/agent.ts",
      "src/lib/agents/**/*.ts",
      "src/lib/jobs/*Job.ts",
      "src/lib/jobs/execution.ts",
      "src/lib/jobs/generation.ts",
    ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: runtimeAgnosticPatterns,
        },
      ],
    },
  },
  {
    // Layers: types <- core <- repositories/lib <- actions/components/app. Lower layers never import upward.
    files: [ "src/core/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": noImports([
        ...runtimeAgnosticPatterns,
        layerPattern("lib", "core must not depend on lib."),
        layerPattern("components", "core must not depend on components."),
        layerPattern("app", "core must not depend on app."),
      ]),
    },
  },
  {
    files: [ "src/core/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-globals": [
        "error",
        ...[ "localStorage", "sessionStorage", "window", "document", "navigator" ].map(name => ({
          name,
          message: "core must be runtime-agnostic: no browser globals.",
        })),
      ],
    },
  },
  {
    files: [ "src/types/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": noImports([
        layerPattern("lib", "types must not depend on lib."),
        layerPattern("components", "types must not depend on components."),
        layerPattern("repositories", "types must not depend on repositories."),
        layerPattern("actions", "types must not depend on actions."),
        layerPattern("app", "types must not depend on app."),
      ]),
    },
  },
  {
    files: [ "src/repositories/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": noImports([
        { group: [ "@/lib/**", "!@/lib/prisma" ], message: "Repositories depend only on core, types and @/lib/prisma." },
        layerPattern("components", "Repositories must not depend on components."),
        layerPattern("actions", "Repositories must not depend on actions."),
        layerPattern("app", "Repositories must not depend on app."),
      ]),
    },
  },
  {
    files: [ "src/lib/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": noImports([
        layerPattern("components", "lib must not depend on components."),
        layerPattern("app", "lib must not depend on app."),
      ]),
    },
  },
  {
    // Job code splits by runtime: shared code imports neither side, and client/server never import each other.
    files: [ "src/lib/jobs/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": noImports([
        ...runtimeAgnosticPatterns,
        layerPattern("lib/jobs/client", "Shared job code must not import client code."),
        layerPattern("lib/jobs/server", "Shared job code must not import server code."),
        layerPattern("components", "lib must not depend on components."),
        layerPattern("app", "lib must not depend on app."),
      ]),
    },
  },
  {
    files: [ "src/lib/jobs/client/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: { "no-restricted-imports": noImports([ layerPattern("lib/jobs/server", "Client code must not import server code.") ]) },
  },
  {
    files: [ "src/lib/jobs/server/**/*.ts" ],
    ignores: [ "**/__tests__/**" ],
    rules: { "no-restricted-imports": noImports([ layerPattern("lib/jobs/client", "Server code must not import client code.") ]) },
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

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
      "src/lib/jobs/jobTypes.ts",
    ],
    ignores: [ "**/__tests__/**" ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: [ "next", "next/*" ], message: "Runtime-agnostic code must not depend on Next." },
            { group: [ "@prisma/client", "@prisma/client/*" ], message: "Runtime-agnostic code must not depend on Prisma." },
            { group: [ "@/repositories", "@/repositories/*" ], message: "Runtime-agnostic code must persist through the Store." },
            { group: [ "@/actions", "@/actions/*" ], message: "Runtime-agnostic code must persist through the Store." },
            { group: [ "openai", "openai/*" ], message: "Runtime-agnostic code must call models through the Llm port." },
          ],
        },
      ],
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

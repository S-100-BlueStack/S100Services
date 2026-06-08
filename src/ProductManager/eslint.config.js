import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        require: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "error",
      "no-console": "off",

      // ArcGIS and DOM integration code sometimes needs wrapper patterns
      // that are more pragmatic than the default rule recommendations.
      "no-async-promise-executor": "off",
      "no-prototype-builtins": "off",

      "prefer-const": "warn",
      "no-var": "error",

      // Large UI orchestration functions are allowed for now, but warnings
      // help identify future split candidates during cleanup work.
      "max-lines-per-function": [
        "warn",
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  prettier,
];

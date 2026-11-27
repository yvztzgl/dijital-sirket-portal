// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Which folder may import which (docs/restructure-plan.md, "Rules that come with it").
 * These are today's folders; phase 1 replaces them with core / ui / layout / features / demo.
 * Warnings for now: the existing breaches are listed, not yet fixed.
 */
const boundary = (files, banned, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['warn', { patterns: [{ group: banned, message }] }],
  },
});

module.exports = defineConfig([
  { ignores: ['dist/**', '.angular/**', 'out-tsc/**', 'tools/**', 'art/**'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
      // Found in the code as it was on 2026-11-27 (10 places). Warnings until they are fixed.
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'warn',
    },
  },
  boundary(
    ['src/app/core/**/*.ts'],
    ['**/shared/**', '**/shell/**', '**/screens/**'],
    'core/ holds no UI and must not import from shared/, shell/ or screens/.',
  ),
  boundary(
    ['src/app/shared/**/*.ts'],
    ['**/shell/**', '**/screens/**'],
    'shared/ is used by the screens and must not import from them or from shell/.',
  ),
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Accessibility findings in the templates as they were on 2026-11-27 (25 places). Warnings
      // until phase 3 of the restructuring touches those templates; new code should not add to them.
      '@angular-eslint/template/interactive-supports-focus': 'warn',
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/label-has-associated-control': 'warn',
      '@angular-eslint/template/role-has-required-aria': 'warn',
      '@angular-eslint/template/no-autofocus': 'warn',
    },
  },
]);

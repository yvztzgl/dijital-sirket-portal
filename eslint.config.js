// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Which folder may import which (docs/restructure-plan.md, "Rules that come with it"):
 * features → layout → ui → core, and features do not import each other. `demo/` may be imported
 * from layout and features on purpose (the mock build's tools), so no rule stops that.
 * Warnings for now: the existing breaches are listed, not yet fixed.
 */
const boundary = (files, patterns) => ({
  files,
  rules: {
    'no-restricted-imports': ['warn', { patterns }],
  },
});

const FEATURES = ['auth', 'landing', 'company', 'eligibility', 'payment', 'e-signature', 'setup'];

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
  boundary(['src/app/core/**/*.ts'], [
    {
      group: ['@ui/**', '@layout/**', '@features/**', '@demo/**'],
      message: 'core/ holds no UI and must not import from ui/, layout/, features/ or demo/.',
    },
  ]),
  boundary(['src/app/ui/**/*.ts'], [
    {
      group: ['@layout/**', '@features/**', '@demo/**'],
      message: 'ui/ holds reusable controls and must not import from layout/, features/ or demo/.',
    },
    { group: ['@core/state/**'], message: 'ui/ components get data through inputs and never inject a store.' },
  ]),
  boundary(['src/app/layout/**/*.ts'], [
    { group: ['@features/**'], message: 'layout/ is the frame pages sit in and must not import from features/.' },
  ]),
  ...FEATURES.map((feature) =>
    boundary(
      [`src/app/features/${feature}/**/*.ts`],
      [{ regex: `^@features/(?!${feature}/)`, message: `features/${feature} must not import another feature.` }],
    ),
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

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    languageOptions: { globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', URL: 'readonly', Blob: 'readonly', FormData: 'readonly', File: 'readonly', HTMLElement: 'readonly', HTMLInputElement: 'readonly', Event: 'readonly', KeyboardEvent: 'readonly', MouseEvent: 'readonly', crypto: 'readonly', indexedDB: 'readonly', Notification: 'readonly', location: 'readonly', history: 'readonly', requestAnimationFrame: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', ServiceWorkerRegistration: 'readonly', PushSubscription: 'readonly', atob: 'readonly', btoa: 'readonly', Intl: 'readonly' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  { ignores: ['dist/**', 'dev-dist/**'] },
);

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // 사용하지 않는 변수 (언더스코어 prefix 허용)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // any 사용 경고 (에러 아님)
      '@typescript-eslint/no-explicit-any': 'warn',
      // console.log 금지 (process.stdout/stderr 사용)
      'no-console': 'error',
    },
  },
  {
    // 테스트 파일은 규칙 완화
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 테스트에서 import-only 사용 패턴 허용
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // ANSI escape 코드를 다루는 포매터 파일
    files: ['src/l2/formatters/**/*.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
  {
    // pagination — cursor 토큰 regex
    files: ['src/l1/pagination/**/*.ts'],
    rules: {
      'no-useless-escape': 'off',
    },
  },
  {
    // 레이어 import 규칙: L1은 L0를 import 불가
    files: ['src/l1/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/l0/**', '@l0/*'], message: 'L1 must not import from L0 (DIP violation)' },
          { group: ['**/l2/**', '@l2/*'], message: 'L1 must not import from L2' },
        ],
      }],
    },
  },
  {
    // L0는 L2를 import 불가
    files: ['src/l0/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/l2/**', '@l2/*'], message: 'L0 must not import from L2' },
        ],
      }],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.*'],
  },
)

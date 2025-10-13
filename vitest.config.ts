import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'Old_src'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/index.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },
    // 測試超時設置
    testTimeout: 30000,
    hookTimeout: 30000,
    
    // 報告器配置
    reporters: ['verbose'],
    
    // 並行執行設置
    threads: true,
    maxThreads: 4,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/core': path.resolve(__dirname, './src/core'),
      '@/math': path.resolve(__dirname, './src/math'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/components': path.resolve(__dirname, './src/components'),
    }
  }
});

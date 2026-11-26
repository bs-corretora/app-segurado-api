import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
              'src/lib/schemas/**',
              'src/lib/datas.ts',
              'src/lib/security/cookies.ts',
              'src/lib/security/rate-limit.ts',
              'src/lib/validacao/**',
              'src/lib/env.ts',
              'src/lib/api-response.ts',
              'src/lib/services/assistente.ts',
              'src/lib/services/conhecimento.ts',
              'src/lib/email/**',
              'src/lib/services/confirmacao-email.ts',
              'src/lib/services/avisos-email.ts',
            ],
      thresholds: { lines: 80 },
    },
  },
});

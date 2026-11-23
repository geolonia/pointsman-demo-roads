import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Secrets for the tests, made at run time (no secret-looking literals in the repository).
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export default defineConfig({
  test: {
    projects: [
      // The Worker, in workerd.
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                POINTSMAN_TOKEN: `pm_${randomUUID()}`,
                BROKER_API_KEY: randomUUID(),
                NOTIFY_SECRET: randomUUID(),
                GITHUB_WEBHOOK_SECRET: randomUUID(),
                GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
              },
            },
          }),
        ],
        test: { name: 'worker', include: ['test/*.test.ts'] },
      },
      // The page's own scripts, in a DOM (#124).
      { test: { name: 'page', environment: 'jsdom', include: ['test/site/*.test.ts'] } },
    ],
  },
});

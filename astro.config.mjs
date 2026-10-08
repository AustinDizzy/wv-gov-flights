// @ts-check
import { defineConfig, sessionDrivers } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  base: process.env.APP_BASE_PATH || '/wv-gov-flights',
  session: {
    // Astro's session API is not used (Better Auth stores sessions in D1), but
    // defining a driver prevents the adapter from auto-provisioning an unwanted
    // KV namespace. If Astro sessions are ever used, isolate them in private R2.
    driver: sessionDrivers.cloudflareR2Binding({
      binding: 'FILES',
      base: '_private/astro-sessions',
    }),
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()]
  },

  adapter: cloudflare({
    imageService: 'compile',
  })
});

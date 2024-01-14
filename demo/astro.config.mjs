import { defineConfig } from 'astro/config';
import wp from 'wp-astro';
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  vite: {},
  adapter: wp({
    devProxyTarget: 'http://localhost:8001',
  }),
  integrations: [react()]
});

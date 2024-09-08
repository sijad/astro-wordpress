import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import wp from "astro-wordpress";

// https://astro.build/config
export default defineConfig({
  vite: {},
  adapter: wp({
    devProxyTarget: "http://localhost:8001",
  }),
  integrations: [react()],
});

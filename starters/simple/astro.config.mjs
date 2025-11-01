// @ts-check
import { defineConfig, passthroughImageService } from "astro/config";
import wordpress from "astro-wordpress";

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: ["host.docker.internal"],
  },
  adapter: wordpress({
    devProxyTarget: "http://localhost:8088",
    outDir: "wp/wp-content/themes/astro-wordpress-starter",
    publicDirPath: "/var/www/html/public",
    devServerTarget: "http://host.docker.internal:4321",
  }),
  image: {
    service: passthroughImageService(),
  },
});

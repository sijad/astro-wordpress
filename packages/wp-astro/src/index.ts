import type { AstroIntegration } from "astro";
import type { AddressInfo } from "node:net";

import { rename, rm, mkdir, writeFile } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import respModifier from "resp-modifier";
import glob from "fast-glob";
import { async as syncDirectory } from "sync-directory";

import { rewriteLinksMiddleware } from "./utils";

interface Options {
  outDir?: string;
  devProxyTarget?: string;
}

export default function createIntegration({ outDir = "./theme/", devProxyTarget }: Options = {}): AstroIntegration {
  let addr: AddressInfo;
  let srcDir: string;

  async function createDevTemplates() {
    const phpAstroFiles = await glob(join(srcDir, "pages/*.php.astro"));
    const templates = phpAstroFiles.map(f => basename(f).slice(0, -6));

    await Promise.all(
      templates.map(async f => {
        const fname = basename(f);
        const themePath = join(outDir, fname);

        const tempPhp = `<?php
$__getDev = function() {
  $context = stream_context_create([
    "http" => [
      "method" => "GET",
      "header" => "by-pass-proxy: 1\\r\\n"
    ]
  ]);

  $base = 'http://${addr.address}:${addr.port}';
  $path = '/${fname}';

  return file_get_contents($base . $path, false, $context);
};

eval('?>'. $__getDev() . '<?php');`;

        await writeFile(themePath, tempPhp, "utf8");
      }),
    );
  }

  return {
    name: "wp-astro-adapter",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          output: "static",
          build: {
            assetsPrefix: join("/wp-content/themes", outDir),
            format: "file",
          },
        });
      },
      "astro:config:done": ({ setAdapter, config }) => {
        srcDir = config.srcDir.pathname;
        setAdapter({
          name: "wp-astro-adapter",
          supportedAstroFeatures: {
            staticOutput: "stable",
            serverOutput: "unsupported",
            hybridOutput: "unsupported",
            assets: {
              isSharpCompatible: false,
              isSquooshCompatible: false,
            },
          },
        });
      },
      "astro:server:setup": async ({ server, logger }) => {
        if (!devProxyTarget) {
          logger.warn("wp-astro requires the `devProxyTarget` option for development mode. Skipping.");
          return;
        }

        server.config.server.proxy = server.config.server.proxy || {};
        server.config.server.proxy["/"] = {
          target: devProxyTarget,
          changeOrigin: true,
          autoRewrite: true,
          secure: false,
          bypass(req) {
            const url = req.url;

            if (!url) {
              return;
            }

            if (
              req.headers["by-pass-proxy"] ||
              url.startsWith("/src") ||
              url.startsWith("/@") ||
              url.startsWith("/node_modules")
            ) {
              return url;
            }
          },
        };

        const modifier = respModifier.create({
          rules: [rewriteLinksMiddleware(new URL(devProxyTarget))],
        });

        server.middlewares.use(modifier.middleware);

        await rm(outDir, { recursive: true, force: true });
        await mkdir(outDir, { recursive: true });

        syncDirectory(server.config.publicDir, outDir, {
          watch: true,
        });
      },
      "astro:server:start": async ({ address }) => {
        addr = address;

        await createDevTemplates();
      },
      "astro:build:done": async ({ dir: _dir, routes }) => {
        const dir = fileURLToPath(_dir);

        await rm(outDir, { recursive: true, force: true });
        await rename(dir, outDir);

        for (const route of routes) {
          const dist = route.distURL;

          if (!dist) {
            continue;
          }

          const path = fileURLToPath(dist);

          if (route.type !== "page" || !path.endsWith(".php.html")) {
            continue;
          }

          const themePath = join(outDir, relative(dir, path));
          const finalName = themePath.slice(0, -5);

          await rename(themePath, finalName);
        }
      },
    },
  };
}

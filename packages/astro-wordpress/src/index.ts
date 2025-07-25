/// <reference path="./php.d.ts" />
import {
  mkdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration, IntegrationResolvedRoute } from "astro";
import glob from "fast-glob";

import {
  rewriteLinksModifier,
  errorHandlerModifier,
  modifyContentMiddleware,
} from "./utils.js";

interface Options {
  outDir?: string;
  devProxyTarget?: string;
}

export default function createIntegration({
  outDir = "./theme/",
  devProxyTarget,
}: Options = {}): AstroIntegration {
  let addr: AddressInfo;
  let srcDir: string;
  let pubDir: string;
  let routes: IntegrationResolvedRoute[] = [];

  async function createDevTemplate(f: string) {
    const themePath = join(outDir, f);

    const tempPhp = `<?php
$__getDev = function() {
  $context = stream_context_create([
    "http" => [
      "method" => "GET",
      "ignore_errors" => true,
      "header" => "by-pass-proxy: 1\\r\\n"
    ]
  ]);

  $base = 'http://${addr.address}:${addr.port}';
  $path = '/${f}';

  $code = file_get_contents($base . $path, false, $context);

  ob_start();

  try {
    eval('?>'. $code);
  } catch(Throwable $e) {
    ob_clean();
    header('X-Error-AWP: 1');
    status_header(500);
    echo json_encode([
      'message' => $e->getMessage(),
      'file' => '${f}',
      'line' => $e->getLine(),
      'code' => $code,
    ]);
    return;
  }

  echo ob_get_clean();
};

$__getDev();`;

    await mkdir(dirname(themePath), { recursive: true });
    await writeFile(themePath, tempPhp, "utf8");
  }

  async function createDevTemplates() {
    const phpAstroFiles = await glob(join(srcDir, "pages/**/*.php.astro"));
    const templates = phpAstroFiles.map((f) =>
      relative(join(srcDir, "/pages"), f).slice(0, -6),
    );

    const promises = templates.map(async (f) => {
      await createDevTemplate(f);
    });

    const pubFiles = await glob(join(pubDir, "*"), { onlyFiles: false });
    pubFiles.forEach((f) => {
      const themePath = join(outDir, basename(f));
      promises.push(symlink(f, themePath));
    });

    await Promise.all(promises);
  }

  return {
    name: "astro-wordpress",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          output: "static",
          build: {
            assetsPrefix: join("/wp-content/themes", basename(outDir)),
            format: "file",
          },
          vite: {
            plugins: [
              {
                name: "php-as-text",
                transform(src, id) {
                  if (id.endsWith(".php")) {
                    return {
                      code: `import { markHTMLString } from 'astro/runtime/server/index.js';
export default markHTMLString(${JSON.stringify(src)});`,
                      map: null,
                    };
                  }
                },
              },
            ],
          },
        });
      },
      "astro:config:done": ({ setAdapter, config }) => {
        srcDir = fileURLToPath(config.srcDir);
        pubDir = fileURLToPath(config.publicDir);
        setAdapter({
          name: "astro-wordpress-adapter",
          adapterFeatures: {
            edgeMiddleware: false,
            buildOutput: "static",
          },
          supportedAstroFeatures: {
            staticOutput: "stable",
            serverOutput: "unsupported",
            hybridOutput: "unsupported",
            sharpImageService: "unsupported",
          },
        });
      },
      "astro:server:setup": async ({ server, logger }) => {
        if (!devProxyTarget) {
          logger.warn(
            "astro-wordpress requires the `devProxyTarget` option for development mode. Skipping.",
          );
          return;
        }

        const config = server.config;

        config.server.proxy = config.server.proxy || {};
        config.server.proxy["/"] = {
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

        server.middlewares.use(
          modifyContentMiddleware([
            rewriteLinksModifier(new URL(devProxyTarget)),
            errorHandlerModifier(server.ws.send.bind(server.ws)),
          ]),
        );

        await rm(outDir, { recursive: true, force: true });
        await mkdir(outDir, { recursive: true });

        server.watcher.on("all", async (event, entry) => {
          const relPath = relative(join(srcDir, "pages"), entry);

          // check if file is .php.astro and inside src/pages/
          if (entry.endsWith(".php.astro") && relPath === basename(entry)) {
            const phpPath = relPath.slice(0, -6);

            if (event === "add") {
              await createDevTemplate(phpPath);
            } else if (event === "unlink") {
              await rm(join(outDir, basename(phpPath)), { force: true });
            }
          } else if (
            // check if entry is inside public dir
            relative(pubDir, entry) === basename(entry)
          ) {
            const themePath = join(outDir, basename(entry));
            if (event === "add" || event === "addDir") {
              await symlink(entry, themePath);
            } else if (event === "unlink" || event === "unlinkDir") {
              await unlink(themePath);
            }
          }
        });
      },
      "astro:server:start": async ({ address }) => {
        addr = address;

        await createDevTemplates();
      },
      "astro:routes:resolved": ({ routes: _routes }) => {
        routes = _routes;
      },
      "astro:build:done": async ({ dir: _dir, assets }) => {
        const dir = fileURLToPath(_dir);

        await rm(outDir, { recursive: true, force: true });
        await rename(dir, outDir);

        for (const route of routes) {
          const dists = assets.get(route.pattern);

          if (!dists) {
            continue;
          }

          for (const dist of dists) {
            const path = fileURLToPath(dist);

            if (route.type !== "page" || !path.endsWith(".php.html")) {
              continue;
            }

            const themePath = join(outDir, relative(dir, path));
            const finalName = themePath.slice(0, -5);

            await rename(themePath, finalName);
          }
        }
      },
    },
  };
}

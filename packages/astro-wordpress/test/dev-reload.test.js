import { it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import wordpress from "../lib/index.js";

it("keeps the working theme and public symlinks available across config reloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "wordpress-reload-"));
  const url = (path) => pathToFileURL(join(root, path) + "/");
  try {
    await mkdir(join(root, "src/pages"), { recursive: true });
    await mkdir(join(root, "public"));
    await writeFile(
      join(root, "src/pages/front-page.php.astro"),
      "<h1>Home</h1>",
    );
    await writeFile(join(root, "public/style.css"), "body{color:navy}");
    await mkdir(join(root, "public/admin"));
    await writeFile(join(root, "public/admin/index.php"), "<?php // admin");
    await writeFile(join(root, "public/stale.css"), "current");
    const output = join(root, "theme");
    // A production build leaves copies rather than development symlinks.
    await mkdir(join(output, "admin"), { recursive: true });
    await writeFile(join(output, "admin/index.php"), "old admin");
    await writeFile(join(output, "style.css"), "old style");
    await symlink(join(root, "missing.css"), join(output, "stale.css"));
    // Leftovers from a build or a deleted page.
    await mkdir(join(output, "_astro"));
    await writeFile(join(output, "_astro/app.js"), "old");
    await writeFile(join(output, "about.php"), "old about");
    const config = {
      root: url(""),
      srcDir: url("src"),
      publicDir: url("public"),
      cacheDir: url(".astro"),
      outDir: url("dist"),
      base: "/",
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const integration = wordpress({
        outDir: output,
        devProxyTarget: "http://127.0.0.1:7001",
      });
      integration.hooks["astro:config:setup"]({
        command: "dev",
        addRenderer() {},
        updateConfig() {},
      });
      integration.hooks["astro:config:done"]({ config, setAdapter() {} });
      const watcher = new EventEmitter();
      watcher.add = () => {};
      const server = {
        config: { base: "/", server: {} },
        watcher,
        httpServer: new EventEmitter(),
        ws: { send() {} },
        middlewares: { use() {} },
      };
      const logger = { info() {}, error() {}, warn() {} };
      await integration.hooks["astro:server:setup"]({ server, logger });
      if (attempt) {
        assert.match(
          await readFile(join(output, "front-page.php"), "utf8"),
          /file_get_contents/,
        );
        assert.equal(
          await readFile(join(output, "style.css"), "utf8"),
          "body{color:navy}",
        );
      }
      await integration.hooks["astro:server:start"]({
        address: { address: "127.0.0.1", port: 4321, family: "IPv4" },
      });
      assert.equal(
        await readlink(join(output, "style.css")),
        join(root, "public/style.css"),
      );
      assert.equal(
        await readlink(join(output, "admin")),
        join(root, "public/admin"),
      );
      assert.equal(
        await readFile(join(output, "admin/index.php"), "utf8"),
        "<?php // admin",
      );
      assert.equal(
        await readFile(join(output, "stale.css"), "utf8"),
        "current",
      );
      assert.match(
        await readFile(join(output, "front-page.php"), "utf8"),
        /127\.0\.0\.1:4321/,
      );
      assert.match(
        await readFile(join(output, "front-page.php"), "utf8"),
        /status_header\(503\)/,
      );
      assert.deepEqual((await readdir(output)).sort(), [
        "admin",
        "front-page.php",
        "stale.css",
        "style.css",
      ]);
      await integration.hooks["astro:server:start"]({
        address: { address: "127.0.0.1", port: 4322, family: "IPv4" },
      });
      assert.match(
        await readFile(join(output, "front-page.php"), "utf8"),
        /127\.0\.0\.1:4322/,
      );
      server.httpServer.emit("close");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

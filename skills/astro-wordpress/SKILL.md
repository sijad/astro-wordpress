---
name: astro-wordpress
description: Convert a plain static Astro template into a WordPress theme using the astro-wordpress adapter — install the adapter, configure astro.config.mjs, add the theme style.css, convert pages to .php.astro, optionally run WordPress itself via Docker Compose. Use when asked to "add astro-wordpress", "turn this Astro site into a WP theme", "integrate with WordPress", "wire up the WordPress adapter", or "run WordPress in Docker for this Astro project". For making content inside that theme editable from the WP backoffice via ACF, see the astro-wordpress-acf skill instead — this skill only covers the base adapter setup.
---

Turns a static [Astro](https://astro.build) template into a WordPress theme
via [astro-wordpress](https://github.com/sijad/astro-wordpress): pages under
`src/pages/*.php.astro` compile to real WordPress template files
(`index.php`, `page-template-*.php`, …), while `npm run dev` proxies through
to a real local WordPress instance so the theme is always previewed live
against it.

This is the verified recipe, not a paraphrase of the adapter's README:
the steps below were applied to a real static Astro template and confirmed
end to end — dev server proxying live through to WordPress, `npm run
build` producing a real activatable theme, `wp theme activate` succeeding.

## Prerequisites

- A local WordPress install reachable over HTTP. Two verified options:
  - **Docker Compose** (recommended — no local PHP/MySQL/wp-cli needed at
    all, and `wp-cli` may well not be installed on the host). See step 0.
  - An already-running local WP install (any PHP server + MySQL/MariaDB
    pointed at by `devProxyTarget`). This skill only converts the *Astro*
    side either way.
- Node/npm for the Astro project.
- `wp-cli` is **optional throughout this skill** — every wp-cli command
  below has a no-wp-cli fallback (browser/curl form submission, or a
  dockerized wp-cli sidecar). Don't add it as a hard requirement.

### 0. (Docker option) Start WordPress with Docker Compose

This exact `compose.yaml` (from the astro-wordpress starter) works
unmodified — verified by actually running it:

```yaml
services:
  wordpress:
    image: wordpress
    restart: always
    ports:
      - 8088:80
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: exampleuser
      WORDPRESS_DB_PASSWORD: examplepass
      WORDPRESS_DB_NAME: exampledb
    volumes:
      - ./wp:/var/www/html
      - ./public/:/var/www/html/public

  db:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_DATABASE: exampledb
      MYSQL_USER: exampleuser
      MYSQL_PASSWORD: examplepass
      MYSQL_RANDOM_ROOT_PASSWORD: "1"
    volumes:
      - db:/var/lib/mysql

volumes:
  db:
```

```bash
docker compose up -d
```

No `wp-cli` in the `wordpress` image by default — finish the install and
everything else either through the browser (`http://localhost:8088`), or
with a one-off dockerized wp-cli container sharing the same network +
volumes (see Verify/Gotchas — this is the pattern to reach for whenever a
step below says `wp ...` and no local `wp-cli` is installed):

```bash
docker run --rm --network container:<wordpress-container-name> \
  --volumes-from <wordpress-container-name> -w /var/www/html \
  -e WORDPRESS_DB_HOST=db -e WORDPRESS_DB_USER=exampleuser \
  -e WORDPRESS_DB_PASSWORD=examplepass -e WORDPRESS_DB_NAME=exampledb \
  wordpress:cli <wp-cli-command>
```

(The `-e` vars must match the `wordpress` service's env — the CLI
container reads the same `wp-config.php`, which resolves them via
`getenv()`, but doesn't inherit the other container's environment.)

## Steps

### 1. Install the adapter

```bash
npm install astro-wordpress
```

(`passthroughImageService` used below ships with Astro core — no extra
package.)

### 2. Configure `astro.config.mjs`

Bare-metal WP (Astro and WP on the same host, no container boundary):

```js
// @ts-check
import { defineConfig, fontProviders, passthroughImageService } from "astro/config";
import wordpress from "astro-wordpress";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  adapter: wordpress({
    devProxyTarget: "http://localhost:7001", // your local WP URL
    outDir: "./wp/wp-content/themes/<theme-name>", // built theme goes here
  }),
  image: {
    service: passthroughImageService(), // required — WP serves/optimizes images itself
  },
});
```

Docker Compose WP (using the `compose.yaml` above) needs three more
options — each verified necessary by actually breaking without them (see
Gotchas):

```js
export default defineConfig({
  server: {
    host: "0.0.0.0", // bind on all interfaces so the container can reach in
    allowedHosts: ["host.docker.internal"],
  },
  adapter: wordpress({
    devProxyTarget: "http://localhost:8088",
    outDir: "./wp/wp-content/themes/<theme-name>",
    // the WP container's own view of the bind-mounted public/ dir —
    // NOT the host path (see Gotchas)
    publicDirPath: "/var/www/html/public",
    // lets the PHP dev-template stub, running *inside* the container,
    // reach back out to the Astro dev server running on the host
    devServerTarget: "http://host.docker.internal:4321",
  }),
  image: { service: passthroughImageService() },
});
```

`devProxyTarget` must match wherever WordPress is actually listening.
`outDir` is where `npm run build` writes the finished theme; it does not
need to live inside the Astro project. If it does (a full local WP
checkout nested under e.g. `./wp/`), add that directory to `.gitignore` —
WordPress core and its uploads don't belong in the Astro project's repo.

### 3. Add the theme stylesheet

WordPress only recognizes a theme directory if it has a `style.css` with
this header — create `public/style.css` (it gets symlinked/copied into
`outDir` automatically by the adapter):

```css
/*!
Theme Name: <Theme Name>
Version: 0.0.1
*/
```

### 4. Convert pages to `.php.astro`

Rename each `src/pages/*.astro` route you want served by WordPress to
`src/pages/*.php.astro` — the file's default export still renders through
Astro/your existing layouts and components unchanged; only the extension
and the eventual output format change (`index.astro` → `index.php`). No
other code changes are required for a page to build and serve correctly.

Non-index WP template files follow the same pattern: `page-template-`
prefix is auto-detected and turned into a `/* Template Name: ... */`
comment WordPress recognizes for custom page templates, e.g.
`src/pages/page-template-landing.php.astro` → a selectable "Landing"
template. (Documented in the adapter's README; not exercised by this
recipe.)

For files that must output raw PHP with **no** surrounding HTML document
(e.g. a `functions.php.astro` used to register hooks/fields — see the
`astro-wordpress-acf` skill), add `export const partial = true;` to the
frontmatter. Without it, Astro auto-prepends `<!DOCTYPE html>` to the output
and corrupts the PHP file.

### 5. Activate the theme

Universally: WP admin → **Appearance → Themes → Activate**. With wp-cli
(local or dockerized, see step 0):

```bash
npm run build
wp theme activate <theme-name> --path=<wp-dir>
```

## Verify

```bash
# 1. dev server + WP both up? every request proxies through devProxyTarget,
#    so even static assets 502 if WP isn't reachable
npm run dev &
curl -o /dev/null -s -w "%{http_code}\n" http://127.0.0.1:4321/

# 2. bypass the WP proxy to see the raw Astro-rendered PHP-flavored output
#    directly from the dev server — useful for isolating "is this an Astro
#    problem or a WordPress problem"
curl -s -H "by-pass-proxy: 1" http://127.0.0.1:4321/index.php | head -c 300

# 3. production build lands real, plain PHP in outDir
npm run build
grep -c '<?php' wp/wp-content/themes/<theme-name>/index.php

# 4. theme is active — via wp-cli, or just load the front page and check
#    for theme-specific markup instead if wp-cli isn't available
wp theme list --path=<wp-dir> | grep <theme-name>
```

No local WP install yet to test against, and want to confirm the WP
install itself works headlessly (no wp-cli, no browser)? The install
wizard is a plain form POST — this is exactly how a fresh WP install was
verified for this skill:

```bash
curl "http://localhost:8088/wp-admin/install.php?step=2" \
  --data-urlencode "weblog_title=My Site" \
  --data-urlencode "user_name=admin" \
  --data-urlencode "admin_password=<password>" \
  --data-urlencode "admin_password2=<password>" \
  --data-urlencode "pw_weak=1" \
  --data-urlencode "admin_email=admin@example.com" \
  --data-urlencode "Submit=Install WordPress"
# then log in the same way (cookie jar) for any later admin-screen checks:
curl -c cookies.txt \
  --data-urlencode "log=admin" --data-urlencode "pwd=<password>" \
  --data-urlencode "wp-submit=Log In" \
  --data-urlencode "redirect_to=http://localhost:8088/wp-admin/" \
  --data-urlencode "testcookie=1" \
  "http://localhost:8088/wp-login.php"
curl -b cookies.txt "http://localhost:8088/wp-admin/" | grep -o "<title>[^<]*</title>"
```

## Gotchas

- **Every dev-mode request proxies to `devProxyTarget`**, not just `.php`
  pages — `/src`, `/@`, `/node_modules`, and anything with a
  `by-pass-proxy` header are the only bypasses. If WordPress isn't running,
  the whole site 502s, including images/fonts under `public/`. Check WP is
  actually up before debugging the Astro side.
- **Astro 7's dev server is a persistent background daemon.** `npm run dev`
  a second time doesn't rebind or error — it just reports the already-running
  instance (`npx astro dev status` / `stop` / `logs` to manage it directly).
- **`export const partial = true;`** — see step 4. This is the single
  most non-obvious requirement in the whole adapter; the failure mode
  (stray `<!DOCTYPE html>` at the top of a PHP file) doesn't look related
  to Astro at all.
- **`publicDirPath` must be the path as the WP *container* sees it, not
  the host path.** The adapter symlinks each `public/` file into the theme
  dir using whatever `publicDirPath` you give it, literally. With Docker,
  give it the container path (`/var/www/html/public`) — confirmed by
  checking the resulting symlink both ways: `readlink
  wp-content/themes/<theme>/style.css` → `/var/www/html/public/style.css`,
  which resolves fine via `docker exec <container> cat
  wp-content/themes/<theme>/style.css` but is `No such file or directory`
  from the host shell. If you omit `publicDirPath`, the adapter falls back
  to the host path, which is invalid inside the container.
- **`astro dev`'s daemon lock is per project directory, not per
  config/port.** Running `astro dev --config other.config.mjs --port 4325`
  while a plain `astro dev` is already running in the same directory just
  reports "Dev server already running" on the *original* port — it does
  not start a second instance. `astro dev stop` the existing one first if
  you need to switch configs (e.g. bare-metal vs. Docker) in the same
  project.
- **This conversion alone does not wire `wp_head()`/`wp_footer()`** into
  the layout, so plugin-injected `<script>`/`<style>` tags, SEO plugin meta
  tags, etc. won't appear. The astro-wordpress README shows adding
  `<Fragment set:html={`<?php wp_head(); ?>`} />` /
  `<?php wp_footer(); ?>` to the layout for that. If the layout builds its
  own `<head>` independently (common when porting an existing static
  template), treat wiring those in as a deliberate follow-up, not something
  this skill's steps already give you.

## Next step

Once the adapter is wired up:

- **`astro-wordpress-acf`** — make specific sections of a page
  editable from the WP backoffice via ACF.
- **`astro-wordpress-menus`** — connect a header/footer/nav component
  to a WordPress-managed menu (Appearance → Menus) instead of hardcoded
  links.
- **`astro-wordpress-global-settings`** — add a site-wide "Theme
  Options" page for values that aren't scoped to any one page (requires
  ACF Pro or Secure Custom Fields).

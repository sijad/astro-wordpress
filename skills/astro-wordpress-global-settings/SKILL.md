---
name: astro-wordpress-global-settings
description: Add a global, site-wide "Theme Options" settings page (not tied to any specific post/page) editable from the WP backoffice, using acf-generator's ACF options-page support — e.g. header login/signup links, footer social links, site-wide toggles. Use when asked to "add a theme options page", "make X a global setting", "site-wide settings in WP admin", "options page", or when a value needs to be editable but isn't naturally scoped to one page. Requires ACF Pro or Secure Custom Fields (SCF) — the free ACF plugin does not support options pages. Assumes the astro-wordpress-acf recipe is already in use for page-scoped fields.
---

Extends the `astro-wordpress-acf` recipe for content that isn't scoped
to any one page — header login/signup links, footer contact info, social
links, a site-wide announcement banner, etc. — using ACF's **options page**
feature (`acf_add_options_page()` + `getCode("options")`) instead of a
page/post location condition.

Verified end to end: a "Theme Options" admin page registered under its own
top-level menu (not attached to any post), two link fields editable there,
values rendering on the live proxied header, and the specific failure mode
when the required plugin tier is missing (see Gotchas — this one is
important and not what you'd guess).

## Prerequisites — read this first

**Options pages require ACF PRO or Secure Custom Fields (SCF). The free
"Advanced Custom Fields" plugin does not include `acf_add_options_page()`.**
Confirmed directly: with only the free plugin active,
`function_exists('acf_add_options_page')` is `false`.

[Secure Custom Fields](https://wordpress.org/plugins/secure-custom-fields/)
is the free option — WordPress.org's own continuation of ACF's free
feature set (including options pages) since the 2025 ACF/WP Engine
trademark dispute, maintained by the WordPress core team. Install it
instead of (or alongside, deactivated) the free ACF plugin:

```bash
wp plugin install secure-custom-fields --activate --path=<wp-path> --allow-root
```

ACF Pro is the paid alternative if the project already licenses it.
Everything below (`acf_add_options_page`, `get_field(..., "option", ...)`,
`update_field(..., "option")`) is identical between SCF and ACF Pro.

## Recipe

### 1. Define the fields + group with an `options_page` location

A dedicated module (not a page file) — every component that needs these
values imports from here directly:

```ts
// src/global-acf-options.ts
import { createGroup } from "acf-generator";

export const { registerCode, phpVars } = createGroup({
  key: "global_group",
  title: "Global Options",
  location: [[{ param: "options_page", operator: "==", value: "theme-options" }]],
  fields: [
    { label: "Header", name: "header_tab", type: "tab" },
    { label: "Login Link", name: "login_link", type: "link" },
    { label: "Signup Link", name: "signup_link", type: "link" },
  ] as const,
}).getCode("options");
```

**Call `.getCode("options")`, not `.getCode()`.** The postId argument is
what switches the generated hook from `wp` (current page) to `acf/init`
(global) and generates `get_field($name, "option", true)` instead of
`get_field($name, false, true)` — passing nothing here silently scopes the
fields to "current page" instead of global, which is the wrong location
type mismatch for `options_page`.

### 2. Register the options page itself

In `functions.php.astro`, guard the `acf_add_options_page()` call — this
guard is exactly what keeps the site from fataling when only free ACF (or
no ACF-family plugin) is active (see Gotchas for what "not fataling"
actually looks like here):

```astro
---
import { registerCode as registerGlobalOptions } from "../global-acf-options";
import { registerCode as registerFrontPage } from "./index.php.astro";

export const partial = true;
---

{registerGlobalOptions}
{registerFrontPage}

<Fragment
  set:html={`<?php
    function theme_init() {
      if ( function_exists( 'acf_add_options_page' ) ) {
        acf_add_options_page(
          array(
            'page_title' => 'Theme Options',
            'menu_title' => 'Theme Options',
            'menu_slug'  => 'theme-options',
            'capability' => 'edit_posts',
            'redirect'   => false,
          )
        );
      }
    }

    add_action( 'init', 'theme_init', 0 );
  ?>`}
/>
```

`menu_slug` must match the `value` used in the field group's
`options_page` location condition in step 1.

### 3. Consume `phpVars` directly in components

Unlike page-scoped ACF fields (threaded in via a `vars` prop from the
page), global options are imported directly wherever they're needed —
there's no natural "owning page" to pass them down from:

```astro
---
import { when } from "astro-stencil/php";
import { phpVars } from "../global-acf-options";
---

{
  when`${phpVars.login_link}`(
    <a class="login" href={phpVars.login_link.url}>{phpVars.login_link.title}</a>,
  )
}
```

Same `when`-for-optional-values rule as page-scoped ACF fields — a
`phpVars` proxy is always JS-truthy regardless of the underlying PHP
value.

## Verify

```bash
# read/write global option values directly (postId = "option")
wp eval 'var_export(get_field("login_link", "option", true));' --path=<wp-path> --allow-root
wp eval 'update_field("login_link", ["title"=>"Log In","url"=>"https://example.com/login","target"=>""], "option");' --path=<wp-path> --allow-root

# confirm the admin page itself exists under its own menu (not a post edit screen)
# (log in first — see astro-wordpress-acf's Verify section for the cookie-jar login)
curl -b cookies.txt "<wp-url>/wp-admin/admin.php?page=theme-options" | grep -oE "Theme Options|>Login Link<"

# confirm it renders on the live page
curl -s http://127.0.0.1:4321/ | grep -oE '<a class="login"[^>]*>[^<]*</a>'
```

## Gotchas

- **Missing SCF/Pro is a *quiet* failure, not a loud one — and quieter
  than you'd expect.** Deactivating SCF and activating only the free ACF
  plugin, then re-checking: `admin.php?page=theme-options` correctly
  403s (`WordPress › Error` — no such admin page was ever registered,
  matching the `function_exists` guard in step 2). But the **front end
  kept rendering the previously-set login/signup links exactly as
  before** — confirmed by curling the live page both before and after
  deactivating SCF. Why: `acf_add_local_field_group()` (unlike
  `acf_add_options_page()`) *is* available in the free plugin, so the
  field group itself still registers successfully and `get_field(...,
  "option", true)` still reads and formats the value correctly from
  whatever's already in the `wp_options` table. **The net effect: losing
  SCF/Pro doesn't break the site, it silently removes editors' ability to
  ever change these values again** — there's no error, no broken page,
  nothing to notice until someone goes looking for the settings screen
  and it isn't there. Don't rely on "the site still looks right" as
  confirmation this feature is actually working — check that the admin
  page itself is reachable.
- **This is a different failure mode than a missing ACF plugin
  entirely** (see `astro-wordpress-acf`'s Gotchas) — that one is a
  hard 500 via `Call to undefined function get_field()`. Here, `get_field`
  itself is available (from the free plugin), only `acf_add_options_page`
  is missing, so the read path keeps working while only the write/admin
  path disappears. If no ACF-family plugin is active at all (not even
  free ACF), `get_field()` doesn't exist either.
- Field **types** (text, link, image, repeater, …) are not gated — only
  the **options page** container is Pro/SCF-only. A `location: options_page`
  group with, say, only `text` fields behaves identically either way for
  every part *except* whether there's an admin screen to edit it on.

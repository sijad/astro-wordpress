---
name: astro-wordpress-menus
description: Connect a navigation component (header, footer, etc.) to a WordPress-managed menu (Appearance → Menus) instead of hardcoded links, using WordPress's native register_nav_menus()/wp_nav_menu() — no ACF needed. Use when asked to "connect the menu to WordPress", "make the header/footer nav editable", "hook up nav-main", "wire up wp_nav_menu", or when replacing a hardcoded links array in a layout/header/footer with WP-editable navigation. Assumes the astro-wordpress adapter is already set up (see the astro-wordpress skill if not).
---

Makes a navigation block editable from **Appearance → Menus** in the WP
backoffice, using plain WordPress menu APIs — `register_nav_menus()` +
`wp_nav_menu()` — embedded as raw PHP via `Fragment set:html`. This is
unrelated to ACF/`acf-generator` (see `astro-wordpress-acf` for
content fields); menus are native WordPress, so there's no typed-vars
layer here, just PHP passed through.

Verified end to end: two independent menus (header + footer) created via
`wp-cli`, assigned to two separate registered locations, each rendering
its own distinct items on the live proxied page, and the same code
present in the production `astro build` output.

## Recipe

### 1. Register the location(s)

One `register_nav_menus()` call in `functions.php.astro`, covering every
location any component will render — `nav-main` for the header,
`nav-footer` for the footer, etc.:

```astro
---
export const partial = true;
---

<Fragment
  set:html={`<?php
    function theme_init() {
      register_nav_menus(
        array(
          'nav-main' => __( 'Main menu', 'theme' ),
          'nav-footer' => __( 'Footer menu', 'theme' ),
        )
      );
    }

    add_action( 'init', 'theme_init', 0 );
  ?>`}
/>
```

(`export const partial = true;` is required here — see the
`astro-wordpress` skill's gotchas; without it Astro prepends a stray
`<!DOCTYPE html>` that corrupts `functions.php`.)

### 2. Render the menu in the component

Replace the hardcoded `links` prop/loop with `wp_nav_menu()`:

```astro
<div class="menu">
  <Fragment
    set:html={`<?php
      wp_nav_menu(
        array(
            'theme_location' => 'nav-main',
            'container' => 'ul',
            'depth' => 2
          )
        );
    ?>`}
  />
</div>
```

`container: 'ul'` makes `wp_nav_menu()` emit its own `<ul><li><a>` — don't
also wrap it in a hand-written `<ul>`. `depth` truncates nested submenus;
set it to whatever level your CSS actually supports (a flat footer list
might use `depth: 1`, a header with dropdowns `depth: 2`+).

Then delete the now-dead `links` prop from the component's `Props`, and
stop passing a hardcoded links array from wherever the component is used
(typically the shared layout).

### 3. Fix the component's scoped CSS

`wp_nav_menu()`'s output is raw PHP text dropped in via `set:html` — it
never passes through Astro's compiler, so it never gets the
`data-astro-cid-*` scoping attribute. **Every selector that touches any
part of that output** needs `:global()` — not just the top-level `ul`,
but each nested type selector too (`li`, `a`, and, if `depth` allows
submenus, the nested `ul` WP wraps them in — e.g. `:global(ul > li >
ul)` or `:global(.sub-menu)`). A selector like `.menu ul li a` half-scoped
(`.menu` scoped, the rest not wrapped) simply never matches:

```css
/* before (only worked because these elements were rendered by Astro) */
.menu {
  ul {
    ...
    a {
      ...
    }
  }
}

/* after */
.menu {
  :global(ul) {
    ...
    :global(a) {
      ...
    }
  }
}
```

## Verify

```bash
# with wp-cli (local or dockerized — see astro-wordpress):
wp menu create "Main Navigation" --path=<wp-path> --allow-root
wp menu item add-custom "Main Navigation" "Home" "/" --path=<wp-path> --allow-root
wp menu location assign main-navigation nav-main --path=<wp-path> --allow-root
wp menu location list --path=<wp-path> --allow-root

# confirm the item actually renders on the live, proxied page
curl -s http://127.0.0.1:4321/ | grep -oE '<a href="[^"]*"[^>]*>Home</a>'
```

No wp-cli? Same thing through the browser: **Appearance → Menus** → create
a menu, add items, assign it to the location under "Menu locations" (or
the Customizer's "Menus" panel, depending on WP version) — then reload the
front end.

## Gotchas

- **Default fallback lists published Pages, not nothing.** If no menu is
  assigned to a `theme_location` yet, `wp_nav_menu()` falls back to
  `wp_page_menu()` — a list of published Pages — rather than rendering
  empty. Confirmed: a fresh site with no menu assigned showed a "Home"
  page link automatically. This is usually fine (better than a blank
  nav) but can be surprising before an editor has created a real menu.
  Pass `'fallback_cb' => false` to suppress it and render nothing
  instead.
- **CSS scoping breaks silently, not loudly, and per-selector.** Forgetting
  `:global()` on *any one* selector in the chain doesn't error — that
  piece just renders unstyled while the rest of the nav looks fine. E.g.
  `depth: 2` (or higher) tells WordPress it's allowed to render nested
  `<ul class="sub-menu">` for items with children — but registering that
  depth doesn't give you submenu CSS for free. If nothing in the
  stylesheet targets `:global(ul > li > ul)`/`:global(.sub-menu)`, a
  submenu will render with default browser list styling, unpositioned,
  the moment an editor adds a child item in wp-admin — even though the
  top-level menu looks correct. Check this whenever `depth` > 1 is set:
  either add the nested-menu CSS or drop `depth` to `1` until it's needed.
- **Register every location once, in one place.** `register_nav_menus()`
  takes an array of *all* locations — call it once in
  `functions.php.astro`'s init hook rather than once per component, so
  there's a single source of truth for what locations exist.

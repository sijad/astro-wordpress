---
name: astro-wordpress-acf
description: Make a section of an astro-wordpress theme editable from the WordPress backoffice by wiring it to Advanced Custom Fields via acf-generator — for both a brand-new component built from scratch and an existing component being converted. Use when asked to "add ACF", "make X editable in WP admin", "hook up ACF fields", "expose this content to the backoffice/CMS", "build a new ACF-backed section", or when converting a static Astro component's hardcoded props into WordPress-editable content. Assumes the astro-wordpress adapter is already set up (see the astro-wordpress skill if not).
---

For a project already using [astro-wordpress](https://github.com/sijad/astro-wordpress)
(Astro adapter → PHP theme) — this is the recipe for adding a new
ACF-editable section using
[acf-generator](https://github.com/sijad/astro-wordpress/tree/main/packages/acf-generator)
(typed ACF field definitions → PHP registration code + typed template
variables, built on `astro-stencil`).

This is the verified recipe, not a paraphrase of the packages' READMEs:
confirmed end to end — field group registered with ACF, visible on the real
WP admin edit screen with the right labels, an edited value rendered on the
live page through the dev proxy, and the same PHP present in the production
`astro build` output.

## Prerequisites

- `acf-generator` and `astro-stencil` as **direct** dependencies. If a
  component imports `astro-stencil/php` directly (for `when`, see step 3),
  don't rely on it resolving only transitively through `acf-generator` —
  add it explicitly.
- A local WordPress install with the **ACF plugin installed and active**
  (`wp plugin install advanced-custom-fields --activate`, or Plugins → Add
  New → "Advanced Custom Fields" → Activate in wp-admin), reachable at the
  `devProxyTarget` configured in `astro.config.mjs`.
- `wp-cli` is **optional** — used below for convenience, but every command
  has a no-wp-cli fallback (`update_field`/`get_field` via a real
  logged-in wp-admin session, or a dockerized `wp-cli` sidecar if running
  WordPress via Docker — see the `astro-wordpress` skill's Prerequisites).
- `npm run dev` running. (Astro dev server is a persistent background
  daemon — `npx astro dev status` / `stop` / `logs`; re-running `npm run
  dev` just reports the existing one, it doesn't rebind.)

## Recipe

### 1. Define the fields next to the component

`src/components/<Name>.fields.ts` — **not** under `src/pages/` (files
there become routes):

```ts
import { createField, type GroupFieldVarsPath } from "acf-generator";

export const heroFields = createField({
  type: "group",
  label: "Hero",
  name: "hero",
  sub_fields: [
    { type: "text", name: "title", label: "Title", required: true },
    { type: "textarea", name: "subtitle", label: "Subtitle" },
    { type: "link", name: "cta", label: "CTA" },
  ],
});

export type HeroVars = GroupFieldVarsPath<typeof heroFields>;
```

Full field-type list (text, image, repeater, flexible_content,
relationship, …) is in `acf-generator`'s `src/types.ts` — every ACF field
type is supported and typed. Picking the right one for a given piece of
content:

| Content shape | Field `type` | Notes |
| --- | --- | --- |
| Short string (title, label) | `text` | |
| Long string (paragraph) | `textarea` | |
| Button/CTA (title + url) | `link` | resolves to `{ url, title, target }` — see step 3 |
| One image | `image` | resolves to `AcfImage` |
| List of images | `gallery` | resolves to `AcfImage[]` |
| Rich text (bold/links/lists from a WYSIWYG editor) | `wysiwyg` | resolves to a `string` of real HTML (`<p>`, `<strong>`, …) — needs `.displayUnescaped` like a `wpautop` textarea, see Gotchas |
| List of plain strings (one per line) | `textarea` | not a native list type — reshape into an array at runtime, see step 6 |
| List of structured rows (question+answer, etc.) | `repeater` | see step 4 |
| A cohesive group of related fields | `group` | nest under a name, e.g. `hero_home` — see step 2 |

When in doubt, reach for the plainest type that stores the right raw
shape (`text`/`textarea`/`link`/`image`) and lean on `group`/`repeater`
for structure — don't reach for `repeater` or `flexible_content` just
because a field holds "multiple things" if those things are really one
fixed set of sub-fields (that's `group`) rather than a variable-length
list (that's `repeater`).

### 2. Register the group where the *page* that owns that location lives

`createGroup(...).getCode()` must be called **exactly once** per group —
the returned object dedupes the `acf_add_local_field_group` call
internally (an `isRegistered` closure var), but only within that one
call's lifetime. Export both `registerCode` and `phpVars` from wherever
you call it, and import from that one module everywhere else you need
them — e.g. in the page template that owns the location condition below
(often `src/pages/index.php.astro` for the front page):

```ts
import { createGroup } from "acf-generator";
import { heroFields } from "../components/Hero.fields";

export const { registerCode, phpVars } = createGroup({
  key: "front_page",
  title: "Home Settings",
  fields: [heroFields],
  hide_on_screen: ["the_content"],
  location: [[{ param: "page_type", operator: "==", value: "front_page" }]],
}).getCode();
```

`location: page_type == front_page` only produces an editable meta box if
WP's Reading settings actually have a **static page assigned as the front
page** (`wp option update show_on_front page` + `wp option update
page_on_front <id>`). Otherwise the group registers (confirm with `wp eval
'var_export(acf_get_field_groups());'`) but there is no admin screen
showing it — nothing is broken, there's just nowhere to edit it yet.

For content that isn't tied to a specific page (global theme settings),
use an ACF **options page** location (`options_page == <slug>`,
`getCode("options")`) instead — see the `astro-wordpress-global-settings`
skill (note: options pages require ACF Pro or SCF (Secure Custom Fields), not
the free ACF plugin).

### 3. Wire `phpVars` into the component

Same whether the component is brand new or being converted: its `Props`
take the generated vars type instead of plain values, and any
conditional uses `when` instead of a JS truthy check — **a `phpVars`
proxy is always truthy in JS** (`subtitle ? … : null` will always take
the truthy branch, even when the underlying PHP value is empty). `when`
from `astro-stencil/php` emits a real `<?php if(...): ?>` around the
branch instead:

```astro
---
import { when } from "astro-stencil/php";
import type { HeroVars } from "./Hero.fields";

interface Props {
  vars: HeroVars;
}
const { vars } = Astro.props;
---

<h1>{vars.title}</h1>
{when`${vars.subtitle}`(<p>{vars.subtitle}</p>)}
{when`${vars.cta.url}`(<Button title={vars.cta.title} url={vars.cta.url} />)}
```

Pass the sub-tree in from the page: `<Hero vars={phpVars.hero} />`.

Nothing above assumes prior hardcoded content — steps 1–3 (and 7) are the
whole recipe for a section that never existed before, not just a
conversion. Confirmed by building one from a blank slate: a `Testimonial`
component (quote + author name + role, `<Testimonial vars={phpVars.testimonial} />`)
written with zero pre-existing props/markup to migrate — field group
registered, meta box appeared correctly labeled on the front-page edit
screen, and a value set via `update_field` rendered live, with no steps
beyond 1–3 and 7 needed. Steps 4–6 are opt-in, reached for only when a
section actually needs a list, cross-component composition, or a
non-native field shape — most new sections are exactly this simple.

### 4. Lists of items: repeater fields

A `repeater` field is just another field type in step 1's `sub_fields` —
nothing changes about steps 1/2/4 for it. Rendering it is the one genuinely
different part, because `phpVars.<repeater>.map()` doesn't behave like a
JS array `.map()` — it builds a real PHP `foreach` loop, and the callback
runs **once, at astro-render/build time**, to generate that loop's PHP
template body. It does not run once per actual FAQ/item — there might be
zero items or fifty in the database; the callback never sees them, only
the PHP-side loop variables:

```ts
// Faqs.fields.ts
sub_fields: [
  { type: "text", name: "title", label: "Title" },
  {
    type: "repeater",
    name: "items",
    label: "Items",
    sub_fields: [
      { type: "text", name: "question", label: "Question" },
      { type: "textarea", name: "answer", label: "Answer", new_lines: "wpautop" },
    ],
  },
],
```

```astro
{when`${vars.items}`(
  <div class="faqs">
    {vars.items.map((item, i) => (
      <div class="faq">
        <h3>{item.question}</h3>
        {/* new_lines: "wpautop" means ACF already wrapped this in real
            <p> tags — {item.answer} would HTML-escape them into visible
            text. .displayUnescaped renders them as actual markup. */}
        <div class="answer">{item.answer.displayUnescaped}</div>
      </div>
    ))}
  </div>,
)}
```

`item` and `i` inside the callback are PHP-loop-bound proxies (`$iter0`,
`$i0`), not real js values — `{item.question}` compiles to
`<?php echo htmlspecialchars($iter0['question']); ?>` inside the generated
`foreach`. To use one of them inside a raw `Fragment set:html` PHP block
(e.g. building a unique DOM id per row, since Astro components render
once but the PHP loop runs N times), pull out its bare PHP reference with
`.variableRef()` — it returns the literal `$i0`-style expression for
splicing into hand-written PHP, unescaped, unlike interpolating the proxy
directly:

```astro
<Fragment set:html={`<?php $row_id = 'faq-' . ${i.variableRef()}; ?>`} />
<h3 id={`<?php echo $row_id; ?>`}>...</h3>
```

Multiple components' field groups combine into one page's `createGroup`
call the same way multiple top-level fields do — `fields: [heroFields,
faqsFields]` registers both as sibling `group` fields under one ACF field
group, each still independently addressable as `phpVars.hero`/
`phpVars.faqs`. That's the *nested* composition pattern: each section
gets its own namespaced sub-object.

### 5. Composing fields across sibling components (flat, not nested)

When a section is really made of several smaller components that always
render together — a heading+CTA wrapping a `Gallery` and a `TextMarquee`,
say — nesting each child under its own key (`vars.gallery.images`,
`vars.textMarquee.text`) adds a layer the parent doesn't need. Instead,
spread each child's own `sub_fields` directly into the parent's, and pass
the **same merged `vars` object** to every child:

```ts
// GalleryText.fields.ts
import { galleryFields } from "./Gallery.fields";
import { textMarqueeFields } from "./TextMarquee.fields";

export const galleryTextFields = createField({
  type: "group",
  name: "galleryText",
  label: "Gallery Text",
  sub_fields: [
    { type: "text", name: "title", label: "Title" },
    { type: "link", name: "cta", label: "CTA" },
    ...galleryFields.field.sub_fields,     // adds `images` as a sibling
    ...textMarqueeFields.field.sub_fields, // adds `text` as a sibling
  ],
});
```

```astro
<!-- GalleryText.astro -->
<Gallery vars={vars} />
<TextMarquee vars={vars} />
```

This type-checks even though `Gallery`'s `Props.vars` type only requires
`{ images: AcfImage[] }` and `TextMarquee`'s only requires `{ text:
string }` — passing an existing object satisfies a narrower prop type as
long as the fields it needs are present; TS's excess-property check only
fires on fresh object literals, not on a variable being passed through.
Each child simply reads the slice of the shared `vars` it declared it
needs and ignores the rest. Use this when components are always composed
together; use the nested pattern (above — separate `phpVars.<name>` per
component) when a section stands alone.

### 6. Escape hatch: reshaping a field's value at runtime

Not every useful shape is a native ACF field type. `TextMarquee` wants a
`string[]` (one marquee item per line), but there's no ACF field type
that stores "an array of lines" — so the field is declared as a plain
`textarea` (typed as a string by acf-generator) and reshaped into a PHP
array *at runtime*, before anything reads it as a list:

```ts
// TextMarquee.fields.ts — declared as a scalar, ACF/acf-generator's
// type system has no better fit for "one item per line"
sub_fields: [
  { type: "textarea", name: "text", label: "Text",
    instructions: "Enter one sentence per line." },
]
```

```astro
---
import type { PathArray } from "astro-stencil";
import type { FieldsPath } from "./TextMarquee.fields";

const { vars: _vars } = Astro.props;
// tell TypeScript what `text` becomes *after* the mutation below —
// acf-generator has no way to type this transformation itself
const vars = _vars as unknown as { text: PathArray<string[]> };
---

<Fragment
  set:html={`<?php ${vars.text.variableRef()} = array_map('trim', explode('\n', ${vars.text.variableRef()})); ?>`}
/>
{vars.text.map((t) => <div>{t}</div>)}
```

`.variableRef()` gives the bare `$GLOBALS[...]['text']` PHP reference,
used here on both sides of a real PHP assignment that overwrites the
stored string with `explode()`'s array result. Because `phpVars` proxies
are just reference generators (re-evaluated by PHP on every use, not
captured JS values), every *later* read of `vars.text` in the same
request — including `.map()` — sees the new array, not the original
string. The `as unknown as {...}` cast is required and expected: this
transformation happens entirely at PHP runtime, so there's no way for
acf-generator's type system to know about it — the cast is how the
developer asserts the post-mutation shape by hand. Put the mutation
`Fragment` immediately before first use; anything reading the field
before it runs still sees the original string.

### 7. Register in `functions.php.astro`

```astro
---
import { registerCode as registerFrontPage } from "./index.php.astro";

export const partial = true;
---

{registerFrontPage}
```

`export const partial = true;` is required here (see Gotchas). Add one
import + one `{register...}` line per group as more ACF-backed
sections/pages are added.

## Verify

No wp-cli needed — a real logged-in session (works identically against
bare-metal or Docker WordPress) proves the meta box actually renders in
the browser, which is the thing that actually matters:

```bash
# log in with a cookie jar (same form a browser submits)
curl -c cookies.txt \
  --data-urlencode "log=admin" --data-urlencode "pwd=<password>" \
  --data-urlencode "wp-submit=Log In" \
  --data-urlencode "redirect_to=<wp-url>/wp-admin/" \
  --data-urlencode "testcookie=1" \
  "<wp-url>/wp-login.php"

# confirm the meta box + its labels actually render on the edit screen
curl -b cookies.txt "<wp-url>/wp-admin/post.php?post=<front_page_id>&action=edit" \
  | grep -oE "Home Settings|>Title<|>Subtitle<|>CTA<"

# confirm the value you set shows up on the real, proxied front-end page
curl -s http://127.0.0.1:4321/ | grep "the text you just set"
```

If `wp-cli` is available (local or dockerized — see the
`astro-wordpress` skill), it's a faster way to seed/inspect values
without going through the admin form:

```bash
# field group actually registered with ACF
wp eval 'foreach (acf_get_field_groups() as $g) echo $g["key"]." - ".$g["title"]."\n";' --path=<wp-path> --allow-root

# set a value the way ACF itself would store it (simulates the admin form)
wp eval 'update_field("hero", ["title"=>"...","subtitle"=>"...","cta"=>["title"=>"...","url"=>"...","target"=>""]], <front_page_id>);' --path=<wp-path> --allow-root

# a repeater's value is just an array of associative arrays, one per row —
# confirmed this round-trips correctly including wpautop-generated <p> tags:
wp eval 'update_field("faqs", ["title"=>"Questions","items"=>[
  ["question"=>"Q1","answer"=>"A1"],
  ["question"=>"Q2","answer"=>"A2"],
]], <front_page_id>);' --path=<wp-path> --allow-root

# a flat-composed group (step 5) takes one value per field regardless of
# which component originally declared it — `images` is a list of real
# attachment IDs (import one first with `wp media import <file> --porcelain`
# if there's nothing in the library yet), `text` is one string, split into
# marquee lines entirely at PHP runtime (step 6):
wp eval 'update_field("galleryText", [
  "title"=>"See it in action",
  "cta"=>["title"=>"Explore","url"=>"https://example.com","target"=>""],
  "images"=>[<attachment_id>],
  "text"=>"Line one\nLine two",
], <front_page_id>);' --path=<wp-path> --allow-root
```

Then `npm run build` and check the built `functions.php`/`index.php` in the
adapter's `outDir` contain plain `<?php … ?>` (no eval-wrapper, no stray
doctype) — that's the code that actually ships.

## Gotchas

- **Missing ACF plugin causes a 500 error on the front end.** It throws
  `Uncaught Error: Call to undefined function get_field()` on any
  front-end page view when no ACF plugin is active — install and activate
  one (ACF, ACF Pro, or SCF) to fix it. **wp-admin itself, however, stays
  usable** even in that state — dashboard and edit screens keep working,
  so there's always a way in to install/activate the missing plugin
  without needing shell/FTP access.
- **`export const partial = true;` is required on any `.php.astro` file
  that isn't a full HTML document** (like `functions.php.astro`). Without
  it, Astro silently prepends `<!DOCTYPE html>` to the output, which lands
  as the first bytes of `functions.php` and breaks it. The symptom is a
  `functions.php` that starts with `<!DOCTYPE html><?php ...`.
- **`phpVars` values are proxy objects, not strings**, even though they
  print correctly with `{vars.title}`. Any JS-level truthiness/equality
  check on them is meaningless (always truthy) — use `when` from
  `astro-stencil/php` for anything conditional.
- **Call `createGroup(...).getCode()` once.** Calling it again elsewhere
  re-registers the group and gives a second, disconnected `phpVars` proxy
  pointed at the same `$GLOBALS` key — confusing, not sandboxed. Export
  `registerCode`/`phpVars` from the single call site instead.
- **`.ts` field-definition files must live outside `src/pages/`.** Astro
  treats everything under `src/pages/` as a route; a plain non-page `.ts`
  file there either gets skipped oddly or errors depending on Astro
  version. Co-locate as `src/components/<Name>.fields.ts` instead.
- **The dev proxy (`astro-wordpress`'s `devProxyTarget`) proxies *every*
  request**, not just `.php` pages — if the local WP server isn't
  running, even static assets under `public/` 502 through `npm run dev`.
  Check `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:<astro-port>/`
  first when nothing loads.
- **A repeater's `.map()` callback runs once at render time, generating a
  PHP loop — it is not called once per row.** `item`/`i` inside it are
  PHP-loop-bound proxies, not JS values pulled from the database; there's
  no way to read "how many rows" or branch on a specific row's content
  from the JS side, because that data doesn't exist yet when the callback
  runs. Anything that needs to vary per-row (a generated id, a class based
  on position) has to be expressed as PHP, via the proxy's `.variableRef()`
  or further PHP logic — not as a JS conditional inside the callback.
- **Default escaping is usually right, but not for fields that already
  contain markup.** `{vars.x}` always HTML-escapes (so raw `<`/`>` typed
  into a text field show up as visible text, not break the page). A field
  configured with `new_lines: "wpautop"` (or a `wysiwyg` field) has ACF
  itself wrapping the value in real `<p>` tags before it ever reaches the
  template — escaping that turns real paragraphs into visible `&lt;p&gt;`
  text. Use `.displayUnescaped` for those specific fields; leave everything
  else on the escaped default.
- **A shared component with a strictly-typed prop (e.g. `interface Props
  { url: string }`) rejects a `phpVars` link/field value at `astro
  check`** with `Type 'PathTerminal' is not assignable to type 'string'`
  — the recipe's own `<Button url={vars.cta.url} />` example only
  type-checks cleanly when that component's prop is loosely/untyped.
  Don't loosen a shared component's prop type just to accommodate ACF
  wiring (it's used by plenty of call sites that pass real strings) —
  cast at the ACF call site instead, the same `as unknown as` escape
  hatch used in step 6: `url={vars.cta.url as unknown as string}`. This
  is expected and safe: the proxy still stringifies to the right PHP echo
  when Astro renders it, the cast only silences a type-checker that has
  no way to know that.

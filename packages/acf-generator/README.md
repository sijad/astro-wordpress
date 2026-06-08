# acf-generator

A type-safe code generator for WordPress [Advanced Custom Fields (ACF)](https://www.advancedcustomfields.com/).

## Installation

Install via npm or yarn:

```bash
npm install acf-generator
```

## Basic Usage

### 1. Define Your Fields

Define fields using the `createField` utility. Compose single fields or nested structures:

```ts
import {
  type GroupFieldVarsPath,
  createField
} from "acf-generator";

export const heroHomeFields = createField({
  type: "group",
  label: "Hero Home",
  name: "hero_home",
  sub_fields: [
    {
      type: "text",
      name: "title",
      label: "Title",
    },
    {
      type: "textarea",
      name: "text",
      label: "Text",
    },
    {
      type: "repeater",
      name: "ctas",
      label: "CTAs",
      layout: "block",
      max: 2,
      sub_fields: [
        {
          type: "link",
          name: "link",
          label: "Link",
        },
      ],
    },
  ],
});

export type FieldsPath = GroupFieldVarsPath<typeof fields>;
```

### 2. Create a Field Group

Generate the group and its PHP registration code with `createGroup`:

```ts
import { createGroup } from "acf-generator";
import { heroHomeFields } from "./components/heroHome.fields.ts";

export const { registerCode: registerFrontPage, phpVars } = createGroup({
  key: "front_page",
  title: "Home Settings",
  fields: [heroHomeFields],
  hide_on_screen: ["the_content"],
  location: [
    [
      {
        param: "page_type",
        operator: "==",
        value: "front_page",
      },
    ],
  ],
}).getCode();

export const { registerCode: registerOptions, phpVars: optionsPhpVars } =
  createGroup({
    key: "global_theme_options",
    title: "Theme Settings",
    fields: [
      // you can also define a field without createField
      {
        label: "Footer Note",
        name: "footer_note",
        type: "link",
      },
    ] as const,
    location: [
      [
        {
          param: "options_page",
          operator: "==",
          value: "theme-options",
        },
      ],
    ],
    // first argument will be passed as $post_id to [get_field](https://www.advancedcustomfields.com/resources/get_field/)
  }).getCode("options");
```

### 3. Register Fields in Templates

With [astro-wordpress](https://github.com/sijad/astro-wordpress), you can register the generated fields inside `functions.php.astro` or a `.php.astro` file and include it in your `functions.php`:

```astro
---
import { registerCode as registerFrontPage } from "./front-page.php.astro";
import { registerCode as registerOptions } from "./acf-global-options.ts";

export const partial = true;
---

{registerOptions}
{registerFrontPage}
```

### 4. Use Generated Variables

This package uses [astro-stencil](https://github.com/sijad/astro-stencil/tree/main/packages/astro-stencil) internally, so generated field variables can be used directly in your Astro templates with full type safety.

```astro
---
import type { FieldsPath } from "./components/heroHome.fields.ts";
import { when } from "astro-stencil/php";

interface Props {
  vars: FieldsPath;
}

const { vars } = Astro.props;
---

<section>
  <h1>{vars.title}</h1>

  {when`${vars.text}`(
    <p>{vars.text}</p>
  )}

  <ul>
    {vars.ctas.map((cta) => (
      <a href={cta.link.url}>{cta.link.title}</a>
    ))}
  </ul>
</section>
```

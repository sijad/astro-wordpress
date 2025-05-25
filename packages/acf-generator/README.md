# acf-generator

A php code generator for WordPress [Advanced Custom Fields (ACF)](https://www.advancedcustomfields.com/).

## Installation

Install via npm or yarn:

```bash
npm install acf-generator
# or
yarn add acf-generator
```

## Basic Usage

### 1. Define Your Fields

Define fields using the `createField` utility. Compose single fields or nested structures:

```ts
import { createField } from "acf-generator";

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
      type: "link",
      name: "cta",
      label: "CTA",
    },
  ],
});
```

### 2. Create a Field Group

Generate the group and its PHP registration code with `createGroup`:

```ts
import { createGroup } from "acf-generator";
import { heroHomeFields } from "./components/heroHome.astro";

export const { registerCode: registerFrontPage, phpVars } = createGroup({
  key: "front_page",
  title: "Home Settings",
  fields: [
    heroHomeFields,
  ],
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

export const { registerCode: registerOptions, phpVars: optionsPhpVars } = createGroup({
  key: "global_theme_options",
  title: "Theme Settings",
  fields: [
    // you can also define a field without createField
    {
      label: "Footer Note",
      name: "footer_note",
      type: "link",
    }
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

### 4. Use phpVars in your templates

```ts
import { phpVars, optionsPhpVars } from './fields.ts';

console.log(`<?php echo ${phpVars.hero_home.title}; ?>`);
console.log(`<?php echo ${optionsPhpVars.footer_note}; ?>`);
```

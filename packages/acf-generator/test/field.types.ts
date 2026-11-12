import type { PathNode } from "astro-stencil";
import { createField, type FieldsToObject } from "../lib/index.js";

const heading = createField({
  type: "text",
  name: "heading",
  label: "Heading",
});
const headingValue: FieldsToObject<[typeof heading]> = { heading: "Hello" };
const rawHeadingValue: FieldsToObject<[typeof heading.field]> = headingValue;
const suffixedHeading = heading.withSuffix("hero");
const suffixedValue: FieldsToObject<[typeof suffixedHeading]> = {
  heading_hero: "Hello",
};
// @ts-expect-error A text field requires a string value.
const invalidHeading: FieldsToObject<[typeof heading]> = { heading: 42 };
const presentation: FieldsToObject<
  [{ type: "tab"; name: "tab"; label: "Tab" }]
> = {};
// @ts-expect-error Presentation fields do not produce values.
void presentation.tab;
void [rawHeadingValue, suffixedValue, invalidHeading];

const fields = [
  { type: "number", name: "count", label: "Count" },
  { type: "tab", name: "tab", label: "Tab" },
  {
    type: "repeater",
    name: "links",
    label: "Links",
    sub_fields: [
      { type: "link", name: "link", label: "Link", return_format: "url" },
    ],
  },
] as const;
const values: FieldsToObject<typeof fields> = {
  count: 1,
  links: [{ link: "/" }],
};
// @ts-expect-error Presentation fields are omitted from values.
const withTab: FieldsToObject<typeof fields> = { count: 1, links: [], tab: "" };
void [values, withTab];

// The documented way to type a phpVars subtree passed to an Astro component.
const hero = createField({
  type: "group",
  name: "hero",
  label: "Hero",
  sub_fields: [{ type: "text", name: "title", label: "Title" }],
});
type HeroVars = PathNode<FieldsToObject<typeof hero.field.sub_fields>>;
declare const vars: HeroVars;
void vars.title.variableRef();
// @ts-expect-error Unknown sub-fields are not part of the path.
void vars.subtitle;

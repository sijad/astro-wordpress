export { default as ForEach } from "./ForEach.astro";
export { default as If } from "./If.astro";
export { default as Else } from "./Else.astro";
export { default as ElseIf } from "./ElseIf.astro";
export { default as Switch } from "./Switch.astro";
export { default as Case } from "./Case.astro";
export { default as Break } from "./Break.astro";
export { default as Continue } from "./Continue.astro";

export class HTMLString extends String {
  get [Symbol.toStringTag](): string;
}

export function php(strings: TemplateStringsArray, ...values: string[]): string;

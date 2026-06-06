const htmlStringSymbol = Symbol.for("astro:html-string");

export class HTMLString extends String {
  [htmlStringSymbol] = true;
}

export default function php(strings, ...values) {
  return new HTMLString(
    strings.reduce((result, str, i) => `${result}${str}${values[i] || ""}`, ""),
  );
}

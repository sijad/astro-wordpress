export class HTMLString extends String {
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag]() {
    return "HTMLString";
  }
}

export default function php(strings, ...values) {
  return new HTMLString(
    strings.reduce((result, str, i) => `${result}${str}${values[i] || ""}`, ""),
  );
}

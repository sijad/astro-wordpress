export type * from "./types";
import type { Field, Group, LocalField, LocalGroup } from "./types";

export class HTMLString extends String {
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get [Symbol.toStringTag]() {
    return "HTMLString";
  }
}

const markHTMLString = (value: string) => {
  return new HTMLString(value) as unknown as string;
};

function addKey(prefix: string, fields: readonly Field[]): Field[] {
  return fields.map((f) => {
    if ("sub_fields" in f) {
      f.sub_fields = addKey(`${prefix}_${f.name}`, f.sub_fields);
    }

    return {
      key: `${prefix}_${f.name}`,
      ...f,
    };
  });
}

export function createField<const T extends Field>(field: T): LocalField<T> {
  return {
    field,
    withSuffix<S extends string>(suffix: S) {
      const name = `${field.name}_${suffix}`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
      return createField({ ...field, name }) as any;
    },
  };
}

export function createGroup<T extends LocalField<Field>[]>(
  group: Group<T>,
): LocalGroup<T[number]["field"][]> {
  const keyPrefix = `$_ACFG_${group.key}_`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createProxy(path: string[]): any {
    function fn() {
      return path
        .map((p, i) => (i === 0 ? `${keyPrefix}${p}` : `['${p}']`))
        .join("");
    }

    return new Proxy(fn, {
      get(_, prop) {
        if (prop === "toString") {
          return fn;
        }

        if (typeof prop === "string") {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return createProxy([...path, prop]);
        }
      },
    });
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any
    phpVar: createProxy([]) as any,
    getRegistrationCode() {
      const fields = addKey(
        group.key,
        group.fields.map((f) => f.field),
      );
      const g = { ...group, fields };

      const str = `<?php
acf_add_local_field_group(json_decode('${JSON.stringify(g)}', true));
?>
`;
      return markHTMLString(str);
    },
    getFieldsCode() {
      const str = group.fields
        .map(
          (f) => `${keyPrefix}${f.field.name} = get_field('${f.field.name}');`,
        )
        .join("\n");

      return markHTMLString(`<?php ${str} ?>`);
    },
  };
}

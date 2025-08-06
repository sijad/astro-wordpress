export type * from "./types";
import type {
  Field,
  FieldsToObject,
  Group,
  LocalField,
  LocalGroup,
} from "./types";

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

function variables<T extends readonly (LocalField<Field> | Field)[]>(
  fields: T,
  prefix = "['",
): FieldsToObject<T> {
  const vars = fields.reduce(
    (o, c) => {
      const field = "field" in c ? c.field : c;
      const name = field.name;

      const value = new String(`${prefix}${name}']`);
      o[name] = value;

      if (field.type === "group" && "sub_fields" in field) {
        Object.assign(
          // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
          o[name] as String,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          variables(field.sub_fields as any, `${value.toString()}['`),
        );
      }

      return o;
    },

    {} as Record<string, unknown>,
  );

  return vars as FieldsToObject<T>;
}

export function createGroup<T extends (LocalField<Field> | Field)[]>(
  group: Group<T>,
): LocalGroup<T> {
  let isRegistered = false;

  return {
    getCode(postId = false, formatValue = true) {
      const keyPrefix = `ACFG_${group.key}_${postId || ""}_`;

      function getRegisterCode() {
        if (isRegistered) {
          return "";
        }

        isRegistered = true;

        const fields = addKey(
          group.key,
          group.fields.map((f) => ("field" in f ? f.field : f)),
        );

        const g = { ...group, fields };
        const str = `if( function_exists('acf_add_local_field_group') ): acf_add_local_field_group(json_decode('${JSON.stringify(g)}', true)); endif;`;
        return str;
      }

      function getFieldsCode() {
        const str = group.fields
          .map((f) => {
            const name = "field" in f ? f.field.name : f.name;
            return `$GLOBALS['${keyPrefix}${name}'] = get_field('${name}', ${JSON.stringify(postId || false)}, ${formatValue ? "true" : "false"});`;
          })
          .join("\n");

        const hook =
          postId === "option" || postId === "options" ? "acf/init" : "wp";

        return `add_action('${hook}', function() { ${str} });`;
      }

      return {
        phpVars: variables(group.fields, `$GLOBALS['${keyPrefix}`),
        registerCode: markHTMLString(
          `<?php ${getRegisterCode()} ${getFieldsCode()} ?>`,
        ),
      };
    },
  };
}

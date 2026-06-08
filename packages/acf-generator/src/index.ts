import { createDataSource } from "astro-stencil/php";
import type {
  Field,
  FieldsToObject,
  Group,
  LocalField,
  LocalGroup,
} from "./types.js";

export type * from "./types.js";

const htmlStringSymbol = Symbol.for("astro:html-string");

export class HTMLString extends String {
  [htmlStringSymbol] = true;
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

export function createGroup<T extends (LocalField<Field> | Field)[]>(
  group: Group<T>,
): LocalGroup<T> {
  let isRegistered = false;

  return {
    getCode(postId = false, formatValue = true) {
      const keyPrefix = `ACFG_${group.key}${postId ? `_${postId}` : ""}`;

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
        return `if( function_exists('acf_add_local_field_group') ): acf_add_local_field_group(json_decode('${JSON.stringify(g)}', true)); endif;`;
      }

      function getFieldsCode() {
        const str = group.fields
          .map((f) => {
            const name = "field" in f ? f.field.name : f.name;
            return `$GLOBALS['${keyPrefix}']['${name}'] = get_field('${name}', ${JSON.stringify(postId || false)}, ${formatValue ? "true" : "false"});`;
          })
          .join("\n");

        const hook =
          postId === "option" || postId === "options" ? "acf/init" : "wp";

        return `add_action('${hook}', function() { $GLOBALS['${keyPrefix}'] = []; ${str} });`;
      }

      const data = createDataSource<FieldsToObject<T>>(["GLOBALS", keyPrefix]);

      return {
        phpVars: data,
        registerCode: markHTMLString(
          `<?php ${getRegisterCode()} ${getFieldsCode()} ?>`,
        ),
      };
    },
  };
}

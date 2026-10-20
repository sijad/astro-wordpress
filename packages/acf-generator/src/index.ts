import { createDataProxy } from "astro-stencil";
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

function phpLiteral(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(phpLiteral).join(", ")}]`;
  if (typeof value === "object") {
    return `[${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${phpLiteral(k)} => ${phpLiteral(v)}`).join(", ")}]`;
  }
  return typeof value === "string"
    ? `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`
    : JSON.stringify(value);
}

function addKey(prefix: string, fields: readonly Field[]): Field[] {
  return fields.map((field) => ({
    ...field,
    key: `${prefix}_${field.name}`,
    ...("sub_fields" in field
      ? { sub_fields: addKey(`${prefix}_${field.name}`, field.sub_fields) }
      : {}),
  }));
}

// Shared counter keeps nested loops and separate groups from reusing variables.
let iterationId = 0;

function createFieldSource<T>(fields: readonly Field[], postId: string | number | boolean, formatValue: boolean) {
  const root = "__acf_field_source";
  const fieldNames = new Set(fields.filter((field) => !["tab", "message", "accordion"].includes(field.type)).map((field) => field.name));
  const renderer = {
    variableRef(path: string[]): string {
      if (path[0] !== root) {
        return `$${path[0]}${path.slice(1).map((key) => `[${phpLiteral(key)}]`).join("")}`;
      }
      const [, name, ...nested] = path;
      if (!name || !fieldNames.has(name)) {
        throw new Error("Read a value field from phpVars; whole groups and presentation fields have no value expression.");
      }
      return `get_field(${phpLiteral(name)}, ${phpLiteral(postId)}, ${phpLiteral(formatValue)})${nested.map((key) => `[${phpLiteral(key)}]`).join("")}`;
    },
    displayEscaped(path: string[]): string {
      return `<?php echo htmlspecialchars(${this.variableRef(path)}); ?>`;
    },
    displayUnescaped(path: string[]): string {
      return `<?php echo ${this.variableRef(path)}; ?>`;
    },
    iteration(path: string[]): [string, string, string, string] {
      const id = iterationId++;
      const item = `acfg_item_${id}`;
      const index = `acfg_index_${id}`;
      return [`<?php foreach(${this.variableRef(path)} as $${index} => $${item}): ?>`, item, index, "<?php endforeach; ?>"];
    },
    arrayLength(path: string[]): string {
      return `count(${this.variableRef(path)})`;
    },
  };
  return createDataProxy<T>(renderer, [root]);
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

export function createGroup<const T extends (LocalField<Field> | Field)[]>(
  group: Group<T>,
): LocalGroup<T> {
  return {
    getCode(postId = false, formatValue = true) {
      function getRegisterCode() {
        const fields = addKey(
          group.key,
          group.fields.map((f) => ("field" in f ? f.field : f)),
        );

        const g = { ...group, fields };
        return `if( function_exists('acf_add_local_field_group') ): acf_add_local_field_group(${phpLiteral(g)}); endif;`;
      }

      const fields = group.fields.map((f) => "field" in f ? f.field : f);
      const data = createFieldSource<FieldsToObject<T>>(fields, postId, formatValue);
      const registerBody = getRegisterCode();
      return {
        phpVars: data,
        registerBody,
        registerCode: markHTMLString(
          `<?php ${registerBody} ?>`,
        ),
      };
    },
  };
}

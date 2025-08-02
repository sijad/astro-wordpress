export type FieldToObject<F extends Field> =
  // group
  F extends {
    type: "group";
    sub_fields: infer Sub;
  }
    ? Record<
        F["name"],
        Sub extends Field[]
          ? FieldsToObject<Sub> & { toString(): string }
          : never
      >
    : // messages
      F extends { type: "tab" } | { type: "message" } | { type: "accordion" }
      ? never
      : Record<F["name"], string>;

type ExtractField<T> =
  T extends LocalField<infer F> ? F : T extends Field ? T : never;

export type FieldsToObject<T extends readonly (LocalField<Field> | Field)[]> =
  UnionToIntersection<FieldToObject<ExtractField<T[number]>>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

interface FieldBase {
  type: string;
  label: string;
  name: string;
  wrapper?: Wrapper;
  conditional_logic?: FieldCondition[][];
  "aria-label"?: string;
  instructions?: string;
  required?: boolean;
}

type ReplaceName<T extends Field, S extends string> = T extends {
  name: infer N extends string;
}
  ? Omit<T, "name"> & { readonly name: `${N}_${S}` }
  : never;

export interface LocalField<T extends Field> {
  field: T;
  withSuffix<S extends string>(suffix: S): LocalField<ReplaceName<T, S>>;
}

export interface LocalGroup<T extends readonly (LocalField<Field> | Field)[]> {
  getCode(
    postId?: string | number | boolean,
    formatValue?: boolean,
  ): {
    phpVars: FieldsToObject<T>;
    registerCode: string;
  };
}

export interface Group<T extends readonly (LocalField<Field> | Field)[]> {
  key: string;
  title: string;
  fields: T;
  location: LocationCondition[][];
  active?: boolean;
  hide_on_screen?: (
    | "permalink"
    | "the_content"
    | "excerpt"
    | "discussion"
    | "comments"
    | "revisions"
    | "slug"
    | "author"
    | "format"
    | "page_attributes"
    | "featured_image"
    | "categories"
    | "tags"
    | "send-trackbacks"
  )[];
  description?: string;
  show_in_rest?: boolean;
  menu_order?: number;
  position?: "normal" | "side" | "acf_after_title";
  style?: "default" | "seamless";
  label_placement?: "top" | "left";
  instruction_placement?: "label" | "field";
}

export interface LocationCondition {
  param:
    | "post_type"
    | "post_template"
    | "post_status"
    | "post_format"
    | "post_category"
    | "post_taxonomy"
    | "post"
    | "page_template"
    | "page_type"
    | "page_parent"
    | "page"
    | "current_user"
    | "current_user_role"
    | "user_form"
    | "user_role"
    | "taxonomy"
    | "attachment"
    | "comment"
    | "widget"
    | "nav_menu"
    | "nav_menu_item"
    | "block"
    | "options_page"
    | (string & {});
  operator: "==" | "!=";
  value: string;
}

interface Wrapper {
  width?: string | number;
  class?: string;
  id?: string;
}

interface FieldCondition {
  field: string;
  operator:
    | "=="
    | "!="
    | "==pattern"
    | "==contains"
    | ">"
    | "<"
    | "==empty"
    | "!=empty";
  value: string;
}

export interface GroupField extends FieldBase {
  type: "group";
  layout?: "block" | "table" | "row";
  sub_fields: Field[];
}

interface RepeaterField extends FieldBase {
  type: "repeater";
  layout?: "table" | "block" | "row";
  pagination?: boolean;
  rows_per_page?: number;
  min?: number;
  max?: number;
  button_label?: string;
  collapsed?: string;
  sub_fields: Field[];
}

interface FlexibleLayout extends FieldBase {
  sub_fields: Field[];
  display?: "table" | "block" | "row";
  min?: number;
  max?: number;
}

interface FlexibleContentField extends FieldBase {
  type: "flexible_content";
  min?: number;
  max?: number;
  button_label?: string;
  layouts: Record<string, FlexibleLayout>;
}

export interface TextField extends FieldBase {
  type: "text";
  default_value?: string;
  maxlength?: number;
  placeholder?: string;
  prepend?: string;
  append?: string;
}

export interface TextareaField extends FieldBase {
  type: "textarea";
  default_value?: string;
  maxlength?: number;
  rows?: number;
  placeholder?: string;
  new_lines?: "wpautop" | "br" | "";
}

export interface NumberField extends FieldBase {
  type: "number";
  default_value?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  step?: number;
  prepend?: string;
  append?: string;
}

export interface RangeField extends FieldBase {
  type: "range";
  default_value?: number;
  min?: number;
  max?: number;
  step?: number;
  prepend?: string;
  append?: string;
}

export interface EmailField extends FieldBase {
  type: "email";
  default_value?: string;
  placeholder?: string;
  prepend?: string;
  append?: string;
}

export interface UrlField extends FieldBase {
  type: "url";
  default_value?: string;
  placeholder?: string;
}

export interface PasswordField extends FieldBase {
  type: "password";
  placeholder?: string;
  prepend?: string;
  append?: string;
}

export interface ImageField extends FieldBase {
  type: "image";
  return_format?: "array" | "url" | "id";
  library?: "all" | "uploadedTo";
  min_width?: string;
  min_height?: string;
  min_size?: string;
  max_width?: string;
  max_height?: string;
  max_size?: string;
  mime_types?: string;
  preview_size?: "thumbnail" | "medium" | "large" | "full";
}

export interface FileField extends FieldBase {
  type: "file";
  return_format?: "array" | "url" | "id";
  library?: "all" | "uploadedTo";
  min_size?: string;
  max_size?: string;
  mime_types?: string;
}

export interface WysiwygField extends FieldBase {
  type: "wysiwyg";
  default_value?: string;
  tabs?: "all" | "visual" | "text";
  toolbar?: "full" | "basic";
  media_upload?: boolean;
  delay?: boolean;
}

export interface OembedField extends FieldBase {
  type: "oembed";
  width?: string;
  height?: string;
}

export interface SelectField extends FieldBase {
  type: "select";
  choices: Record<string, string>;
  default_value?: string;
  return_format?: "value" | "label" | "array";
  multiple?: boolean;
  allow_null?: boolean;
  ui?: boolean;
  ajax?: boolean;
}

export interface CheckboxField extends FieldBase {
  type: "checkbox";
  choices: Record<string, string>;
  default_value?: string;
  return_format?: "value" | "label" | "array";
  allow_custom?: boolean;
  save_custom?: boolean;
  layout?: "vertical" | "horizontal";
  toggle?: boolean;
}

export interface RadioField extends FieldBase {
  type: "radio";
  choices: Record<string, string>;
  default_value?: string;
  return_format?: "value" | "label" | "array";
  allow_null?: boolean;
  other_choice?: boolean;
  save_other_choice?: boolean;
  layout?: "vertical" | "horizontal";
}

export interface ButtonGroupField extends FieldBase {
  type: "button_group";
  choices: Record<string, string>;
  default_value?: string;
  return_format?: "value" | "label" | "array";
  allow_null?: boolean;
  layout?: "horizontal" | "vertical";
}

export interface TrueFalseField extends FieldBase {
  type: "true_false";
  message?: string;
  default_value?: boolean;
  ui_on_text?: string;
  ui_off_text?: string;
  ui?: boolean;
}

export interface LinkField extends FieldBase {
  type: "link";
  return_format?: "array" | "url";
}

export interface PostObjectField extends FieldBase {
  type: "post_object";
  post_type?: "post" | "page" | "attachment" | (string & {});
  post_status?:
    | "publish"
    | "future"
    | "draft"
    | "pending"
    | "private"
    | (string & {});
  taxonomy?: string;
  return_format?: "object" | "id";
  multiple?: boolean;
  allow_null?: boolean;
  bidirectional?: boolean;
}

export interface PageLinkField extends FieldBase {
  type: "page_link";
  post_type?: "post" | "page" | "attachment" | (string & {});
  post_status?:
    | "publish"
    | "future"
    | "draft"
    | "pending"
    | "private"
    | (string & {});
  taxonomy?: string;
  allow_archives?: boolean;
  multiple?: boolean;
  allow_null?: boolean;
}

export interface RelationshipField extends FieldBase {
  type: "relationship";
  post_type?: "post" | "page" | "attachment" | (string & {});
  post_status?:
    | "publish"
    | "future"
    | "draft"
    | "pending"
    | "private"
    | (string & {});
  taxonomy?: string;
  filters?: "search" | "post_type" | "taxonomy";
  return_format?: "object" | "id";
  min?: number;
  max?: number;
  elements?: "featured_image";
  bidirectional?: boolean;
}

export interface TaxonomyField extends FieldBase {
  type: "taxonomy";
  taxonomy?: "category" | "post_tag" | "post_format" | (string & {});
  add_term?: boolean;
  save_terms?: boolean;
  load_terms?: boolean;
  return_format?: "object" | "id";
  field_type?: "checkbox" | "multi_select" | "radio" | "select";
  allow_null?: boolean;
  bidirectional?: boolean;
}

export interface UserField extends FieldBase {
  type: "user";
  role?:
    | "administrator"
    | "editor"
    | "author"
    | "contributor"
    | "subscriber"
    | (string & {});
  return_format?: "array" | "object" | "id";
  multiple?: boolean;
  allow_null?: boolean;
  bidirectional?: boolean;
}

export interface GoogleMapField extends FieldBase {
  type: "google_map";
  center_lat?: string;
  center_lng?: string;
  zoom?: string;
  height?: string;
}

export interface DatePickerField extends FieldBase {
  type: "date_picker";
  display_format?: "d/m/Y" | "m/d/Y" | "F j, Y" | (string & {});
  return_format?: "d/m/Y" | "m/d/Y" | "F j, Y" | "Ymd" | (string & {});
}

export interface DateTimePickerField extends FieldBase {
  type: "date_time_picker";
  display_format?:
    | "d/m/Y g:i a"
    | "m/d/Y g:i a"
    | "F j, Y g:i a"
    | "Y-m-d H:i:s"
    | (string & {});
  return_format?:
    | "d/m/Y g:i a"
    | "m/d/Y g:i a"
    | "F j, Y g:i a"
    | "Y-m-d H:i:s"
    | (string & {});
}

export interface TimePickerField extends FieldBase {
  type: "time_picker";
  display_format?: "g:i a" | "H:i:s" | (string & {});
  return_format?: "g:i a" | "H:i:s" | (string & {});
}

export interface ColorPickerField extends FieldBase {
  type: "color_picker";
  default_value?: string;
  enable_opacity?: boolean;
  return_format?: "string" | "array";
}

export interface MessageField extends FieldBase {
  type: "message";
  message?: string;
  new_lines?: "wpautop" | "br" | "";
  esc_html?: boolean;
}

export interface AccordionField extends FieldBase {
  type: "accordion";
  open?: boolean;
  multi_expand?: boolean;
  endpoint?: boolean;
}

export interface TabField extends FieldBase {
  type: "tab";
  placement?: "top" | "left";
  endpoint?: boolean;
}

export interface GalleryField extends FieldBase {
  type: "gallery";
  return_format?: "array" | "url" | "id";
  library?: "all" | "uploadedTo";
  min?: number;
  max?: number;
  min_width?: string;
  min_height?: string;
  min_size?: string;
  max_width?: string;
  max_height?: string;
  max_size?: string;
  mime_types?: string;
  insert?: "append" | "prepend";
  preview_size?: "thumbnail" | "medium" | "large" | "full";
}

export interface CloneField extends FieldBase {
  type: "clone";
  clone: string[];
  display?: "group" | "seamless";
  layout?: "block" | "table" | "row";
  prefix_label?: boolean;
  prefix_name?: boolean;
}

export type Field =
  | GroupField
  | RepeaterField
  | FlexibleContentField
  | TextField
  | TextareaField
  | NumberField
  | RangeField
  | EmailField
  | UrlField
  | PasswordField
  | ImageField
  | FileField
  | WysiwygField
  | OembedField
  | SelectField
  | CheckboxField
  | RadioField
  | ButtonGroupField
  | TrueFalseField
  | LinkField
  | PostObjectField
  | PageLinkField
  | RelationshipField
  | TaxonomyField
  | UserField
  | GoogleMapField
  | DatePickerField
  | DateTimePickerField
  | TimePickerField
  | ColorPickerField
  | MessageField
  | AccordionField
  | TabField
  | GalleryField
  | CloneField;

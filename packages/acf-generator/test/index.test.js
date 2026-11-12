import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createField, createGroup } from "../lib/index.js";

void test("each getCode call includes registration independently", () => {
  const fields = createGroup({
    key: "example",
    title: "Example",
    fields: [],
    location: [],
  });
  const first = String(fields.getCode().registerCode);
  assert.equal(String(fields.getCode().registerCode), first);
  assert.match(
    String(fields.getCode("options").registerCode),
    /acf_add_local_field_group/,
  );
});

void test("frozen nested fields can be reused across groups without mutation", () => {
  const child = Object.freeze({ type: "text", name: "title", label: "Title" });
  const nested = Object.freeze({
    type: "group",
    name: "details",
    label: "Details",
    sub_fields: Object.freeze([child]),
  });
  // Frozen inputs are deliberately passed from JavaScript to check runtime immutability.
  const shared = createField(nested);
  const before = JSON.stringify(shared.field);
  for (const key of ["first", "second"]) {
    const fields = createGroup({
      key,
      title: key,
      fields: [shared],
      location: [],
    });
    const code = String(fields.getCode().registerCode);
    assert.ok(code.includes(`${key}_details_title`));
    assert.equal(JSON.stringify(shared.field), before);
  }
  assert.equal("key" in child, false);
});

const phpAvailable = spawnSync("php", ["-v"]).status === 0;
void test(
  "generated PHP preserves quotes, backslashes, Unicode and post IDs",
  { skip: !phpAvailable },
  () => {
    const name = "field'\\name";
    const key = "group'\\key";
    const title = "Editor's \\ path — $value";
    const fields = createGroup({
      key,
      title,
      location: [],
      fields: [
        { type: "text", name, label: title, default_value: "line\nnext\\'" },
      ],
    });
    for (const postId of [false, 0, 42, "options", "option", "post'\\$id"]) {
      const generated = fields.getCode(postId, false);
      const code = String(generated.registerCode);
      const result = spawnSync("php", [], {
        encoding: "utf8",
        input: `<?php
function acf_add_local_field_group($group) { $GLOBALS['registered'] = $group; }
function get_field($name, $post_id, $format) { $GLOBALS['calls'][] = [$name, $post_id, $format]; return 'value'; }
?>${code}<?php $value = ${generated.phpVars[name].variableRef()}; echo json_encode([$GLOBALS['registered'], $GLOBALS['calls']]); ?>`,
      });
      assert.equal(result.status, 0, result.stderr);
      const [registered, calls] = JSON.parse(result.stdout);
      assert.equal(registered.title, title);
      assert.equal(registered.key, key);
      assert.equal(registered.fields[0].name, name);
      assert.equal(registered.fields[0].default_value, "line\nnext\\'");
      assert.deepEqual(calls, [[name, postId, false]]);
    }
  },
);

void test("registration does not fetch values", { skip: !phpAvailable }, () => {
  const code = createGroup({
    key: "direct",
    title: "Direct",
    location: [],
    fields: [
      { type: "tab", name: "tab", label: "Tab" },
      { type: "message", name: "message", label: "Message" },
      { type: "accordion", name: "accordion", label: "Accordion" },
      { type: "text", name: "value", label: "Value" },
    ],
  }).getCode();
  const { phpVars, registerBody: body } = code;
  for (const unwanted of [
    "json_decode",
    "<?php",
    "$GLOBALS",
    "ArrayAccess",
    "add_action",
  ])
    assert.ok(!body.includes(unwanted));
  assert.throws(() => phpVars.variableRef(), /Read a value field/);
  for (const name of ["tab", "message", "accordion"])
    assert.throws(() => phpVars[name].variableRef(), /Read a value field/);
  const run = spawnSync("php", [], {
    encoding: "utf8",
    input: `<?php
function acf_add_local_field_group($g){if(count($g['fields'])!==4)throw new Exception('fields lost');}
${body}
function get_field() { throw new Exception('unexpected fetch'); }`,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

void test(
  "nested reads, output, conditions, lengths and nested repeater loops execute as PHP",
  { skip: !phpAvailable },
  async () => {
    const { when } = await import("astro-stencil/php");
    const { phpVars: v } = createGroup({
      key: "nested",
      title: "Nested",
      location: [],
      fields: [
        {
          type: "group",
          name: "hero",
          label: "Hero",
          sub_fields: [{ type: "text", name: "title'\\$x", label: "Title" }],
        },
        {
          type: "repeater",
          name: "rows",
          label: "Rows",
          sub_fields: [
            { type: "text", name: "title", label: "Title" },
            {
              type: "repeater",
              name: "children",
              label: "Children",
              sub_fields: [{ type: "text", name: "title", label: "Title" }],
            },
          ],
        },
      ],
    }).getCode("options", false);
    assert.equal(v.rows.variableRef(), "get_field('rows', 'options', false)");
    const loop = v.rows.map((row, index) => [
      row.title.displayEscaped(),
      ":",
      `<?php echo ${index.variableRef()}; ?>`,
      ":",
      row.children.map((child) => child.title.displayEscaped()),
    ]);
    const condition = when(v.rows)("yes", "no");
    const source = [
      v.hero["title'\\$x"].displayEscaped(),
      "|",
      v.hero["title'\\$x"].displayUnescaped(),
      "|",
      `<?php echo ${v.rows.length}; ?>`,
      "|",
      condition,
      "|",
      loop,
    ]
      .flat(Infinity)
      .join("");
    const fixture = {
      hero: { ["title'\\$x"]: "<b>" },
      rows: [
        { title: "A&", children: [{ title: "X" }] },
        { title: "B", children: [{ title: "Y" }] },
      ],
    };
    const encoded = Buffer.from(JSON.stringify(fixture)).toString("base64");
    const run = spawnSync("php", [], {
      encoding: "utf8",
      input: `<?php
function get_field($name,$post,$format){
 if($post!=='options'||$format!==false)throw new Exception('arguments');
 return json_decode(base64_decode('${encoded}'),true)[$name];
}
?>${source}`,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "&lt;b&gt;|<b>|2|yes|A&amp;:0:XB:1:Y");
  },
);

void test(
  "direct reads resolve changing current posts without a generator cache",
  { skip: !phpAvailable },
  () => {
    const { phpVars: v } = createGroup({
      key: "post",
      title: "Post",
      location: [],
      fields: [{ type: "text", name: "value", label: "Value" }],
    }).getCode();
    const expression = v.value.variableRef();
    const run = spawnSync("php", [], {
      encoding: "utf8",
      input: `<?php
function get_field($name,$post,$format){return $post===false ? $GLOBALS['current_post'] : $post;}
$GLOBALS['current_post']=1;$a=${expression};$GLOBALS['current_post']=2;$b=${expression};
echo json_encode([$a,$b]);`,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), [1, 2]);
  },
);

void test("composing bodies emits no output", () => {
  const body = createGroup({
    key: "empty",
    title: "Empty",
    location: [],
    fields: [],
  }).getCode().registerBody;
  const run = spawnSync("php", [], {
    encoding: "utf8",
    input: `<?php\n${body}\n${body}\n`,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

void test("field value types", async () => {
  const ts = await import("typescript");
  const filename = fileURLToPath(new URL("./field.types.ts", import.meta.url));
  const program = ts.createProgram([filename], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    ),
    [],
  );
});

void test("source returns the same group read from another post", () => {
  const group = createGroup({
    key: "options_group",
    title: "Options",
    location: [],
    fields: [createField({ type: "text", name: "title", label: "Title" })],
  });
  const options = group.source("options");
  assert.equal(group.postId, false);
  assert.equal(options.postId, "options");
  assert.equal(options.group, group.group);
  assert.match(
    String(options.getCode().phpVars.title),
    /get_field\('title', 'options', true\)/,
  );
  assert.match(
    String(options.getCode(5).phpVars.title),
    /get_field\('title', 5, true\)/,
  );
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
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
  assert.match(String(fields.getCode("options").registerCode), /acf_add_local_field_group/);
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
      fields: [{ type: "text", name, label: title, default_value: "line\nnext\\'" }],
    });
    for (const postId of [false, 0, 42, "options", "option", "post'\\$id"]) {
      const code = String(fields.getCode(postId, false).registerCode);
      const result = spawnSync("php", [], {
        encoding: "utf8",
        input: `<?php
function acf_add_local_field_group($group) { $GLOBALS['registered'] = $group; }
function add_action($hook, $callback) { $GLOBALS['hook'] = $hook; $callback(); }
function is_admin() { return false; }
function get_field($name, $post_id, $format) { $GLOBALS['calls'][] = [$name, $post_id, $format]; return 'value'; }
?>${code}<?php echo json_encode([$GLOBALS['registered'], $GLOBALS['calls'], $GLOBALS['hook']]); ?>`,
      });
      assert.equal(result.status, 0, result.stderr);
      const [registered, calls, hook] = JSON.parse(result.stdout);
      assert.equal(registered.title, title);
      assert.equal(registered.key, key);
      assert.equal(registered.fields[0].name, name);
      assert.equal(registered.fields[0].default_value, "line\nnext\\'");
      assert.deepEqual(calls, [[name, postId, false]]);
      assert.equal(hook, postId === "option" || postId === "options" ? "acf/init" : "wp");
    }
  },
);

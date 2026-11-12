import assert from "node:assert/strict";
import test from "node:test";
import {
  errorHandlerModifier,
  pageTemplateNameComment,
  parseAddressInfo,
} from "../lib/utils.js";

/** @param {number} statusCode @param {Record<string, string>} headers */
function response(statusCode, headers = {}) {
  return {
    statusCode,
    hasHeader: (name) =>
      Object.keys(headers).some(
        (key) => key.toLowerCase() === name.toLowerCase(),
      ),
  };
}

void test("error handler passes through responses that are not PHP errors", () => {
  const modify = errorHandlerModifier(() =>
    assert.fail("unexpected error payload"),
  );
  assert.equal(modify("<h1>ok</h1>", {}, response(200)), "<h1>ok</h1>");
  assert.equal(modify("<h1>broken</h1>", {}, response(500)), "<h1>broken</h1>");
});

void test("error handler forwards PHP errors to the Vite overlay", async () => {
  const sent = [];
  const modify = errorHandlerModifier((payload) => sent.push(payload));
  const error = {
    message: "Parse error,unexpected token",
    line: 2,
    code: "<?php\nfoo(",
    file: "index.php",
  };
  const content = `junk/* awp-error-start */${JSON.stringify(error)}/* awp-error-end */junk`;
  const html = modify(content, {}, response(500, { "X-Error-AWP": "1" }));
  assert.match(html, /<title>PHP error<\/title>/);
  assert.match(html, /\/@vite\/client/);
  for (let i = 0; i < 50 && !sent.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].err.name, "Parse error");
  assert.equal(sent[0].err.message, "unexpected token");
  assert.deepEqual(sent[0].err.loc, {
    file: "index.php",
    line: 2,
    column: undefined,
  });
  assert.match(sent[0].err.highlightedCode, /error-line/);
});

void test("page template comments are derived from page-template file names", () => {
  assert.equal(
    pageTemplateNameComment("page-template-full-width.php"),
    "/* Template Name: Full Width */",
  );
  assert.equal(
    pageTemplateNameComment("page-template-landingPage.php"),
    "/* Template Name: Landing Page */",
  );
  assert.equal(pageTemplateNameComment("page-about.php"), "");
  assert.equal(pageTemplateNameComment("page-template-x.html"), "");
});

void test("address info uses explicit or protocol default ports", () => {
  assert.deepEqual(parseAddressInfo("http://127.0.0.1:4321"), {
    address: "127.0.0.1",
    family: "IPv4",
    port: 4321,
  });
  assert.deepEqual(parseAddressInfo("https://example.com"), {
    address: "example.com",
    family: "IPv4",
    port: 443,
  });
});

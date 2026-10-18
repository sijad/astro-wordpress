import { Buffer } from "node:buffer";
import { setImmediate } from "node:timers";
import assert from "node:assert/strict";
import { once } from "node:events";
import { IncomingMessage, ServerResponse } from "node:http";
import { Duplex } from "node:stream";
import test from "node:test";
import { modifyContentMiddleware, rewriteLinksModifier } from "../lib/utils.js";

/** @param {Parameters<typeof modifyContentMiddleware>[0]} modifiers */
function response(modifiers = []) {
  const output = [];
  const socket = new Duplex({
    read() {
      /* Responses only write to this socket. */
    },
    write(chunk, encoding, callback) {
      output.push(Buffer.from(chunk));
      callback();
    },
  });
  const req = new IncomingMessage(socket);
  req.method = "GET";
  const res = new ServerResponse(req);
  res.assignSocket(socket);
  modifyContentMiddleware(modifiers)(req, res, () => {
    /* No downstream middleware in this harness. */
  });
  return { res, output, wire: () => Buffer.concat(output).toString() };
}

void test("mixed Astro error chunks, UTF-8 length, modifiers and callbacks", async () => {
  const { res, wire } = response([(s) => s.replace("original", "modified")]);
  res.statusCode = 500;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  let writes = 0;
  let ended = false;
  res.write(Buffer.from("original "), () => writes++);
  res.write(new Uint8Array(Buffer.from("é ")));
  res.write("caf");
  res.write("c3a9", "hex", () => writes++);
  const finished = once(res, "finish");
  res.end('<script type="module"></script>', () => {
    ended = true;
  });
  await finished;
  const body = 'modified é café<script type="module"></script>';
  assert.ok(wire().endsWith(body));
  assert.match(wire(), new RegExp(`Content-Length: ${Buffer.byteLength(body)}\\r\\n`, "i"));
  assert.match(wire(), /^HTTP\/1.1 500/);
  assert.equal(writes, 2);
  assert.equal(ended, true);
});

for (const headers of [
  { "Content-Type": "text/html", "Content-Length": "1" },
  ["Content-Type", "text/html", "Content-Length", "1"],
]) {
  void test(`writeHead HTML headers: ${Array.isArray(headers) ? "array" : "object"}`, async () => {
    const { res, wire } = response([(s) => s.toUpperCase()]);
    res.writeHead(500, "Broken", headers);
    assert.equal(res.getHeader("content-type"), "text/html");
    res.write("hello");
    const finished = once(res, "finish");
    res.end(" world");
    await finished;
    assert.match(wire(), /HELLO WORLD/);
    assert.doesNotMatch(wire(), /content-length:/i);
    assert.match(wire(), /^HTTP\/1.1 500 Broken/);
  });
}

for (const contentType of ["application/octet-stream", "text/event-stream"]) {
  void test(`${contentType} streams without modification`, async () => {
    const { res, output } = response([() => assert.fail("non-HTML modifier")]);
    res.writeHead(200, { "Content-Type": contentType });
    const before = output.length;
    res.write(Buffer.from([0, 255, 128]));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(output.length > before);
    const finished = once(res, "finish");
    res.end();
    await finished;
    assert.ok(Buffer.concat(output).includes(Buffer.from([0, 255, 128])));
  });
}

for (const form of ["callback", "encoding-callback", "empty"]) {
  void test(`end overload: ${form}`, async () => {
    const { res } = response();
    res.setHeader("Content-Type", "text/html");
    let called = false;
    const done = () => {
      called = true;
    };
    const finished = once(res, "finish");
    if (form === "callback") res.end(done);
    else if (form === "encoding-callback") res.end("é", "utf8", done);
    else res.end(undefined, done);
    await finished;
    assert.equal(called, true);
  });
}

void test("link rewriting matches exact hosts and preserves URL suffixes", () => {
  const rewrite = rewriteLinksModifier(new URL("http://wp.example.com:8080"));
  const req = { headers: { host: "localhost:4321" } };
  for (const suffix of ["/path?q=1#hash", "?q=1", "#hash", ""]) {
    assert.equal(rewrite(`https://wp.example.com:8080${suffix}`, req), `//localhost:4321${suffix}`);
  }
  for (const prefix of ['"//', "'//", '"/', '"']) {
    assert.equal(
      rewrite(`${prefix}wp.example.com:8080/path"`, req),
      `${prefix}localhost:4321/path"`,
    );
  }
  assert.equal(
    rewrite(String.raw`https:\/\/wp.example.com:8080/path`, req),
    String.raw`\/\/localhost:4321/path`,
  );
  for (const host of [
    "wpXexample.com:8080",
    "wp.example.com:80800",
    "wp.example.com:8080.evil",
    "wp.example.com:8080@evil",
  ]) {
    const input = `"https://${host}/path"`;
    assert.equal(rewrite(input, req), input);
  }
  assert.equal(rewrite('".wp.example.com:8080/path"', req), '".wp.example.com:8080/path"');
  assert.equal(
    rewrite("http://wp.example.com:8080/", { headers: {} }),
    "http://wp.example.com:8080/",
  );
});

void test("raw headers retain duplicate cookies and non-HTML content length", async () => {
  const { res, wire } = response();
  res.writeHead(200, [
    "Content-Type",
    "application/octet-stream",
    "Content-Length",
    "3",
    "Set-Cookie",
    "a=1",
    "set-cookie",
    "b=2",
  ]);
  const finished = once(res, "finish");
  res.end(Buffer.from([0, 255, 128]));
  await finished;
  assert.match(wire(), /content-length: 3/i);
  assert.match(wire(), /set-cookie: a=1/i);
  assert.match(wire(), /set-cookie: b=2/i);
});

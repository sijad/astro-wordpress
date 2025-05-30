/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable no-undef */
import { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";

export function rewriteLinksMiddleware(userServer: URL) {
  const host = userServer.hostname;
  let string = host;
  const port = userServer.port;

  if (host && port) {
    if (parseInt(port, 10) !== 80) {
      string = host + ":" + port;
    }
  }

  const reg = new RegExp(
    // a simple, but exact match
    "https?:\\\\/\\\\/" +
      string +
      "|" +
      // following ['"] + exact
      "('|\")\\/\\/" +
      string +
      "|" +
      // exact match with optional trailing slash
      "https?://" +
      string +
      "(?!:)(/)?" +
      "|" +
      // following ['"] + exact + possible multiple (imr srcset etc)
      "('|\")(https?://|/|\\.)?" +
      string +
      "(?!:)(/)?(.*?)(?=[ ,'\"\\s])",
    "g",
  );

  const clReg = /content-length/i;

  function modify(content: string, url: string) {
    return content.replaceAll(reg, (match) => {
      if (match[0] === ".") {
        return match;
      }

      const captured = match[0] === "'" || match[0] === '"' ? match[0] : "";

      if (match[0] === "'" || match[0] === '"') {
        match = match.slice(1);
      }

      const out = parse(match);

      if (!out.host) {
        string = string.replace(/^\//, "");
        return captured + match.replace(string, url);
      }

      if (out.path === "/") {
        if (match.slice(-1) === "/") {
          out.path = "/";
        } else {
          out.path = "";
        }
      }

      return [captured, "//", url, out.path, out.hash || ""].join("");
    });
  }

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const end = res.end;
    const writeHead = res.writeHead;
    const list: Buffer[] = [];

    res.writeHead = function (...args) {
      const headers = args[args.length - 1] as any;

      if (typeof headers === "object") {
        for (const name in headers) {
          if (clReg.test(name)) {
            delete headers[name];
          }
        }
      }

      if (res.getHeader("content-length")) {
        res.removeHeader("content-length");
      }

      return writeHead.apply(res, args as any);
    };

    res.write = function (chunk) {
      list.push(chunk);
      return true;
    };

    res.end = function (chunk?: any, encoding?: any) {
      const isHtml = res
        .getHeader("content-type")
        ?.toString()
        .startsWith("text/html");

      if (chunk) {
        list.push(chunk);
      }

      let content;
      if (Buffer.isBuffer(list[0])) {
        content = Buffer.concat(list);
      } else {
        content = list.join("");
      }

      if (isHtml) {
        content = modify(content.toString(), req.headers["host"] || "");
      }

      if (!res.headersSent) {
        res.setHeader("content-length", content.length);
      }

      return end.call(res, content, encoding);
    };

    return next();
  };
}

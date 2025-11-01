/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
import type { ShikiTransformer } from "shiki";
import { codeToHtml, createCssVariablesTheme } from "shiki";
import { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";
import { AddressInfo, isIP } from "node:net";

export function modifyContentMiddleware(
  modifiers: ((
    content: string,
    req: IncomingMessage,
    res: ServerResponse,
  ) => string)[],
) {
  const clReg = /content-length/i;

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
      const contentType = res.getHeader("content-type")?.toString() || "";
      const isHtml = contentType.startsWith("text/html");

      if (chunk) {
        list.push(chunk);
      }

      let content: Buffer | string;
      const first = list[0] as any;
      if (first && (Buffer.isBuffer(first) || first instanceof Uint8Array)) {
        content = Buffer.concat(list);
      } else {
        content = list.join("");
      }

      if (isHtml) {
        content = content.toString();

        modifiers.forEach((fn) => {
          content = fn(content as string, req, res);
        });
      }

      if (!res.headersSent) {
        res.setHeader("content-length", content.length);
      }

      return end.call(res, content, encoding);
    };

    return next();
  };
}

export function rewriteLinksModifier(userServer: URL) {
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

  return function modify(content: string, req: IncomingMessage) {
    const url = req.headers["host"] || "";

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
  };
}

export function errorHandlerModifier(webSocketSend: (msg: unknown) => void) {
  const theme = createCssVariablesTheme({ variablePrefix: "--astro-code-" });

  /**
   * Transformer for `shiki`'s legacy `lineOptions`, allows to add classes to specific lines
   * FROM: https://github.com/shikijs/shiki/blob/4a58472070a9a359a4deafec23bb576a73e24c6a/packages/transformers/src/transformers/compact-line-options.ts
   * LICENSE: https://github.com/shikijs/shiki/blob/4a58472070a9a359a4deafec23bb576a73e24c6a/LICENSE
   */
  function transformerCompactLineOptions(
    lineOptions: {
      /**
       * 1-based line number.
       */
      line: number;
      classes?: string[];
    }[] = [],
  ): ShikiTransformer {
    return {
      name: "@shikijs/transformers:compact-line-options",
      line(node, line) {
        const lineOption = lineOptions.find((o) => o.line === line);
        if (lineOption?.classes) this.addClassToHast(node, lineOption.classes);
        return node;
      },
    };
  }

  async function sendError(err: {
    message: string;
    line: number;
    code: string;
    file: string;
  }) {
    const [name, message] = err.message.includes(",")
      ? err.message.split(",")
      : ["Runtime Error", err.message];

    const payload = {
      __isEnhancedAstroErrorPayload: true,
      type: "error",
      err: {
        name,
        message,
        loc: {
          file: err.file,
          line: err.line,
          column: undefined,
        },
        hint: undefined,
        highlightedCode: await codeToHtml(err.code, {
          lang: "php",
          theme,
          transformers: [
            transformerCompactLineOptions(
              err.line
                ? [{ line: err.line, classes: ["error-line"] }]
                : undefined,
            ),
          ],
        }),
        type: undefined,
        frame: undefined,
        plugin: undefined,
        stack: undefined,
        cause: undefined,
      },
    };

    setTimeout(() => webSocketSend(payload), 200);
  }

  return function modify(
    content: string,
    _req: IncomingMessage,
    res: ServerResponse,
  ) {
    if (res.statusCode === 500 && res.hasHeader("X-Error-AWP")) {
      const startMarker = "/* awp-error-start */";
      const endMarker = "/* awp-error-end */";

      const startIndex = content.indexOf(startMarker);
      const endIndex = content.indexOf(endMarker);

      try {
        const error = JSON.parse(
          content.slice(startIndex + startMarker.length, endIndex),
        );

        sendError(error).catch((e) => {
          console.log(e);
        });

        return `<title>PHP error</title><script type="module" src="/@vite/client"></script>`;
      } catch (e) {
        console.log(e);
      }
    }

    return content;
  };
}

export function pageTemplateNameComment(fileName: string) {
  function toTitleCase(str: string) {
    str = str.replace(/[-_]/g, " ");
    str = str.replace(/([a-z])([A-Z])/g, "$1 $2");
    return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }

  if (fileName.startsWith("page-template-") && fileName.endsWith(".php")) {
    const templateName = toTitleCase(fileName.slice(14, -4));
    return `/* Template Name: ${templateName} */`;
  }

  return "";
}

export function parseAddressInfo(urlStr: string): AddressInfo | undefined {
  const url = new URL(urlStr);

  if (!url.hostname) {
    return;
  }

  const host = url.hostname;
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);

  const family = isIP(host) === 6 ? "IPv6" : "IPv4";

  return {
    address: host,
    family,
    port,
  };
}

import type { ShikiTransformer } from "shiki";
import { codeToHtml, createCssVariablesTheme } from "shiki";
import { IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo, isIP } from "node:net";

export function modifyContentMiddleware(
  modifiers: ((content: string, req: IncomingMessage, res: ServerResponse) => string)[],
) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const end = res.end.bind(res);
    const write = res.write.bind(res);
    const writeHead = res.writeHead.bind(res);
    const chunks: Buffer[] = [];
    let ending = false;
    const isHtml = () =>
      /^text\/html(?:\s*;|$)/i.test(res.getHeader("content-type")?.toString() || "");
    const toBuffer = (chunk: string | Uint8Array, encoding: BufferEncoding) =>
      typeof chunk === "string" ? Buffer.from(chunk, encoding) : Buffer.from(chunk);

    res.writeHead = function (statusCode, statusMessageOrHeaders?, headers?) {
      const suppliedHeaders =
        typeof statusMessageOrHeaders === "string" ? headers : statusMessageOrHeaders;
      if (Array.isArray(suppliedHeaders)) {
        const seen = new Set<string>();
        for (let i = 0; i < suppliedHeaders.length; i += 2) {
          const name = suppliedHeaders[i];
          if (seen.has(name.toLowerCase())) {
            res.appendHeader(name, suppliedHeaders[i + 1]);
          } else {
            res.setHeader(name, suppliedHeaders[i + 1]);
            seen.add(name.toLowerCase());
          }
        }
      } else if (suppliedHeaders) {
        for (const [name, value] of Object.entries(suppliedHeaders)) {
          if (value !== undefined) res.setHeader(name, value);
        }
      }
      if (isHtml() && !ending) res.removeHeader("content-length");
      return typeof statusMessageOrHeaders === "string"
        ? writeHead(statusCode, statusMessageOrHeaders)
        : writeHead(statusCode);
    };

    res.write = function (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) {
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8";
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      if (!isHtml()) return write(chunk, encoding, done);
      chunks.push(toBuffer(chunk, encoding));
      if (done) process.nextTick(done);
      return true;
    };

    res.end = function (
      chunk?: string | Uint8Array | (() => void) | null,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void,
    ) {
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8";
      const done =
        typeof chunk === "function"
          ? chunk
          : typeof encodingOrCallback === "function"
            ? encodingOrCallback
            : callback;
      const data = typeof chunk === "function" ? undefined : chunk;
      if (!isHtml() && chunks.length === 0) {
        return data == null ? end(done) : end(data, encoding, done);
      }
      if (data != null) chunks.push(toBuffer(data, encoding));
      let content = Buffer.concat(chunks).toString("utf8");
      for (const modifier of modifiers) content = modifier(content, req, res);
      chunks.length = 0;
      if (!res.headersSent) {
        res.setHeader("content-length", Buffer.byteLength(content));
      }
      ending = true;
      return end(content, "utf8", done);
    };

    return next();
  };
}

export function rewriteLinksModifier(userServer: URL) {
  const host = userServer.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = String.raw`(?=$|[/?#\\\s"'<> ,])`;
  const reg = new RegExp(
    `(https?:\\/\\/|https?:\\\\/\\\\/|["'](?://|\\\\/\\\\/|/)?|["']\\.)${host}${boundary}`,
    "gi",
  );

  return function modify(content: string, req: IncomingMessage) {
    const target = req.headers.host;
    if (!target) return content;
    return content.replace(reg, (match: string, prefix: string) => {
      if (prefix.endsWith(".")) return match;
      if (/^https?:/i.test(prefix)) {
        return prefix.includes("\\") ? `\\/\\/${target}` : `//${target}`;
      }
      return prefix + target;
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

  async function sendError(err: { message: string; line: number; code: string; file: string }) {
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
              err.line ? [{ line: err.line, classes: ["error-line"] }] : undefined,
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

  return function modify(content: string, _req: IncomingMessage, res: ServerResponse) {
    if (res.statusCode === 500 && res.hasHeader("X-Error-AWP")) {
      const startMarker = "/* awp-error-start */";
      const endMarker = "/* awp-error-end */";

      const startIndex = content.indexOf(startMarker);
      const endIndex = content.indexOf(endMarker);

      try {
        const error = JSON.parse(content.slice(startIndex + startMarker.length, endIndex));

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

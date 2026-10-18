import type { ShikiTransformer } from "shiki";
import { codeToHtml, createCssVariablesTheme } from "shiki";
import { IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo, isIP } from "node:net";

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

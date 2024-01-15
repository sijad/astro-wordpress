import { IncomingMessage, ServerResponse } from "node:http";
import {parse} from 'node:url';

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

  return {
    match: reg,
    fn: function (req: IncomingMessage, _res: ServerResponse, match: string) {
      const proxyUrl = req.headers["host"] || "";

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
        return captured + match.replace(string, proxyUrl);
      }

      if (out.path === "/") {
        if (match.slice(-1) === "/") {
          out.path = "/";
        } else {
          out.path = "";
        }
      }

      return [
        captured,
        "//",
        proxyUrl,
        out.path,
        out.hash || "",
      ].join("");
    },
  };
}

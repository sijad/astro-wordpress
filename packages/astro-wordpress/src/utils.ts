import { IncomingMessage, ServerResponse } from "node:http";

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

      const out = new URL(match);

      if (!out.host) {
        string = string.replace(/^\//, "");
        return captured + match.replace(string, proxyUrl);
      }

      if (out.pathname === "/") {
        if (match.slice(-1) === "/") {
          out.pathname = "/";
        } else {
          out.pathname = "";
        }
      }

      return [captured, "//", proxyUrl, out.pathname || "", out.hash || ""].join(
        "",
      );
    },
  };
}

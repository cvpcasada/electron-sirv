import * as fs from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { totalist } from "totalist/sync";
import { lookup } from "mrmime";

type UnformedResponse = {
  abs: string;
  stats: fs.Stats;
  headers: Record<string, string>;
};

function fromArray<T>(arrayable: Arrayable<T>): T[] {
  return Array.isArray(arrayable) ? arrayable : [arrayable];
}

function isMatch(uri: string, arr: RegExp[]) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].test(uri)) return true;
  }
}

function toAssume(uri: string, extns: string[]) {
  let i = 0,
    x: string,
    len = uri.length - 1;
  if (uri.charCodeAt(len) === 47) {
    uri = uri.substring(0, len);
  }

  let arr: string[] = [],
    tmp = `${uri}/index`;
  for (; i < extns.length; i++) {
    x = extns[i] ? `.${extns[i]}` : "";
    if (uri) arr.push(uri + x);
    arr.push(tmp + x);
  }

  return arr;
}

function viaCache(
  cache: Record<string, any>,
  uri: string,
  extns: string[]
):
  | {
      abs: string;
      stats: fs.Stats;
      headers: Record<string, string>;
    }
  | undefined {
  let i = 0,
    data,
    arr = toAssume(uri, extns);
  for (; i < arr.length; i++) {
    if ((data = cache[arr[i]])) return data;
  }
}

function viaLocal(dir: string, isEtag: boolean, uri: string, extns: string[]) {
  let i = 0,
    arr = toAssume(uri, extns);
  let abs: string,
    stats: fs.Stats,
    name: string,
    headers: Record<string, string>;
  for (; i < arr.length; i++) {
    abs = normalize(join(dir, (name = arr[i])));

    if (abs.startsWith(dir) && fs.existsSync(abs)) {
      stats = fs.statSync(abs);
      if (stats.isDirectory()) continue;
      headers = toHeaders(name, stats, isEtag);
      headers["Cache-Control"] = isEtag ? "no-cache" : "no-store";
      return { abs, stats, headers };
    }
  }
}

function is404(_req: Request) {
  return new Response(null, {
    status: 404,
  });
}

export type RequestHandler = (request: Request) => Response | Promise<Response>;

function send(req: Request, data: UnformedResponse) {
  let code = 200,
    opts: { start?: number; end?: number } = {};

  let headers = data.headers;

  if (req.headers.get("range")) {
    code = 206;
    let [x, y] =
      req.headers.get("range")?.replace("bytes=", "").split("-") ?? [];
    let end = (opts.end = parseInt(y, 10) || data.stats.size - 1);
    let start = (opts.start = parseInt(x, 10) || 0);

    if (end >= data.stats.size) {
      end = data.stats.size - 1;
    }

    if (start >= data.stats.size) {
      headers["Content-Range"] = `bytes */${data.stats.size}`;
      code = 416;
    }

    headers["Content-Range"] = `bytes ${start}-${end}/${data.stats.size}`;
    headers["Content-Length"] = (end - start + 1).toString();
    headers["Accept-Ranges"] = "bytes";
  }

  return new Response(
    fs.createReadStream(data.abs, opts) as unknown as ReadableStream,
    {
      status: code,
      headers,
    }
  );
}

const ENCODING: Record<string, string> = {
  ".br": "br",
  ".gz": "gzip",
};

function toHeaders(name: string, stats: fs.Stats, isEtag: boolean) {
  let enc = ENCODING[name.slice(-3)];

  let ctype = lookup(name.slice(0, enc ? -3 : undefined)) || "";

  if (ctype === "text/html") ctype += ";charset=utf-8";

  let headers: Record<string, string> = {
    "Content-Length": stats.size.toString(),
    "Content-Type": ctype,
    "Last-Modified": stats.mtime.toUTCString(),
  };

  if (enc) headers["Content-Encoding"] = enc;
  if (isEtag) headers["ETag"] = `W/"${stats.size}-${stats.mtime.getTime()}"`;

  return headers;
}

type Arrayable<T> = T | T[];

export interface ServeOptions {
  noCache?: boolean;
  etag?: boolean;
  maxAge?: number;
  immutable?: boolean;
  single?: string | boolean;
  ignores?: Arrayable<string | RegExp>;
  extensions?: string[];
  dotfiles?: boolean;
  brotli?: boolean;
  gzip?: boolean;
  onNoMatch?: (req: Request) => Response;
  setHeaders?: (
    req: Request,
    data: UnformedResponse,
    pathname: string
  ) => Record<string, string>;
}

export function serve(dir: string, opts: ServeOptions = {}): RequestHandler {
  dir = resolve(dir || ".");

  let isNotFound = opts.onNoMatch ?? is404;
  let setHeaders =
    opts.setHeaders ??
    ((req: Request, data: UnformedResponse, pathname: string) => data.headers);

  let extensions = opts.extensions || ["html", "htm"];
  let gzips = opts.gzip && extensions.map((x) => `${x}.gz`).concat("gz");
  let brots = opts.brotli && extensions.map((x) => `${x}.br`).concat("br");

  const FILES: Record<string, UnformedResponse> = {};

  let fallback = "/";
  let isEtag = !!opts.etag;
  let isSPA = !!opts.single;
  if (typeof opts.single === "string") {
    let idx = opts.single.lastIndexOf(".");
    fallback += !!~idx ? opts.single.substring(0, idx) : opts.single;
  }

  let ignores: RegExp[] = [];
  if (opts.ignores) {
    ignores.push(/[/]([A-Za-z\s\d~$._-]+\.\w+){1,}$/); // any extn
    if (opts.dotfiles) ignores.push(/\/\.\w/);
    else ignores.push(/\/\.well-known/);
    fromArray(opts.ignores).forEach((x) => {
      ignores.push(new RegExp(x, "i"));
    });
  }

  let cc = opts.maxAge != null && `public,max-age=${opts.maxAge}`;
  if (cc && opts.immutable) cc += ",immutable";
  else if (cc && opts.maxAge === 0) cc += ",must-revalidate";

  if (!opts.noCache) {
    totalist(dir, (name, abs, stats) => {
      if (/\.well-known[\\+\/]/.test(name)) {
      } // keep
      else if (!opts.dotfiles && /(^\.|[\\+|\/+]\.)/.test(name)) return;

      let headers = toHeaders(name, stats, isEtag);
      if (cc) headers["Cache-Control"] = cc;

      FILES["/" + name.normalize().replace(/\\+/g, "/")] = {
        abs,
        stats,
        headers,
      };
    });
  }

  let lookup = opts.noCache
    ? viaLocal.bind(0, dir + sep, isEtag)
    : viaCache.bind(0, FILES);

  return (req: Request) => {
    let extns = [""];
    let pathname = new URL(req.url).pathname;
    let val = req.headers.get("accept-encoding") ?? "";
    if (gzips && val.includes("gzip")) extns.unshift(...gzips);
    if (brots && /(br|brotli)/i.test(val)) extns.unshift(...brots);
    extns.push(...extensions); // [...br, ...gz, orig, ...exts]

    if (pathname.indexOf("%") !== -1) {
      try {
        pathname = decodeURI(pathname);
      } catch (err) {
        /* malform uri */
      }
    }

    let data =
      lookup(pathname, extns) ||
      (isSPA && !isMatch(pathname, ignores) && lookup(fallback, extns));
    if (!data) return isNotFound(req);

    if (isEtag && req.headers.get("if-none-match") === data.headers["ETag"]) {
      return new Response(null, {
        status: 304,
        headers: data.headers,
      });
    }

    if (gzips || brots) {
      data.headers["Vary"] = "Accept-Encoding";
    }

    data.headers = { ...data.headers, ...setHeaders(req, data, pathname) };

    return send(req, data);
  };
}

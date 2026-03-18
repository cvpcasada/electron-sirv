import { describe, expect, test } from "bun:test";
import path from "node:path";
import { serve } from "../src/serve";

const fixtureDir = path.join(import.meta.dir, "fixtures");

async function responseText(response: Response) {
  return response.text();
}

describe("static request handler", () => {
  test("serves the directory index file", async () => {
    const handler = serve(fixtureDir);
    const response = await handler(new Request("app://-/"));

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("Fixture Index");
    expect(response.headers.get("content-type")).toBe("text/html;charset=utf-8");
  });

  test("serves encoded URIs", async () => {
    const handler = serve(fixtureDir);
    const response = await handler(new Request("app://-/index%201.html"));

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("Fixture Encoded");
  });

  test("falls back to the SPA entry for unresolved extensionless routes", async () => {
    const handler = serve(fixtureDir, { single: true });
    const response = await handler(new Request("app://-/missing"));

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("Fixture Index");
  });

  test("does not fall back for unresolved html files", async () => {
    const handler = serve(fixtureDir, { single: true });
    const response = await handler(new Request("app://-/missing.html"));

    expect(response.status).toBe(404);
  });

  test("does not fall back for unresolved non-html assets", async () => {
    const handler = serve(fixtureDir, { single: true });
    const response = await handler(new Request("app://-/missing.png"));

    expect(response.status).toBe(404);
  });

  test("falls back to a custom SPA file", async () => {
    const handler = serve(fixtureDir, { single: "owl.html" });
    const response = await handler(new Request("app://-/route/that/does/not/exist"));

    expect(response.status).toBe(200);
    expect(await responseText(response)).toContain("Fixture Owl");
  });

  test("does not leak per-request headers from the cache", async () => {
    const handler = serve(fixtureDir, {
      setHeaders(req) {
        const requestId = req.headers.get("x-request-id");
        return requestId ? { "X-Request-Id": requestId } : {};
      },
    });

    const firstResponse = await handler(
      new Request("app://-/index.html", {
        headers: { "x-request-id": "one" },
      })
    );
    const secondResponse = await handler(new Request("app://-/index.html"));

    expect(firstResponse.headers.get("x-request-id")).toBe("one");
    expect(secondResponse.headers.get("x-request-id")).toBeNull();
  });
});

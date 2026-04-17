import { beforeEach, describe, expect, mock, test } from "bun:test";

type ReadyListener = () => void;

const readyListeners: ReadyListener[] = [];
const registerSchemesCalls: unknown[] = [];
const handleCalls: Array<{ scheme: string; handler: unknown }> = [];
const partitionHandleCalls: Array<{
  partition: string;
  scheme: string;
  handler: unknown;
}> = [];
let appPath = import.meta.dir;

const defaultSession = {
  protocol: {
    handle: (scheme: string, handler: unknown) => {
      handleCalls.push({ scheme, handler });
    },
  },
};

const electronMock = {
  app: {
    getAppPath: () => appPath,
    on: (event: string, listener: ReadyListener) => {
      if (event === "ready") {
        readyListeners.push(listener);
      }
    },
  },
  protocol: {
    registerSchemesAsPrivileged: (schemes: unknown) => {
      registerSchemesCalls.push(schemes);
    },
  },
  session: {
    defaultSession,
    fromPartition: (partition: string) => ({
      protocol: {
        handle: (scheme: string, handler: unknown) => {
          partitionHandleCalls.push({ partition, scheme, handler });
        },
      },
    }),
  },
};

mock.module("electron", () => ({
  default: electronMock,
  ...electronMock,
  BrowserWindow: class BrowserWindow {},
}));

const { serve } = await import("../src/index");

function emitReady() {
  for (const listener of readyListeners) {
    listener();
  }
}

beforeEach(() => {
  readyListeners.length = 0;
  registerSchemesCalls.length = 0;
  handleCalls.length = 0;
  partitionHandleCalls.length = 0;
  appPath = import.meta.dir;
});

describe("index serve()", () => {
  test("appends a path segment when given a URL", async () => {
    const window = {
      loadURL: mock(async (_url: string) => {}),
    };

    const loadURL = serve(new URL("https://example.com/app"));
    await loadURL(window as never, "/settings?tab=profile");

    expect(window.loadURL).toHaveBeenCalledWith(
      "https://example.com/settings?tab=profile",
    );
  });

  test("registers the protocol handler on app ready", async () => {
    const loadURL = serve({ directory: "fixtures" });
    const window = {
      loadURL: mock(async (_url: string) => {}),
    };

    expect(registerSchemesCalls).toHaveLength(1);
    expect(handleCalls).toHaveLength(0);

    emitReady();

    expect(handleCalls).toHaveLength(1);
    expect(handleCalls[0]?.scheme).toBe("app");

    await loadURL(window as never, "/?foo=bar");
    expect(window.loadURL).toHaveBeenCalledWith("app://-/?foo=bar");
  });

  test("uses a partition-specific session when requested", () => {
    serve({ directory: "fixtures", partition: "persist:settings" });

    emitReady();

    expect(partitionHandleCalls).toHaveLength(1);
    expect(partitionHandleCalls[0]).toMatchObject({
      partition: "persist:settings",
      scheme: "app",
    });
  });

  test("loads the custom file path when file is provided", async () => {
    const loadURL = serve({ directory: "fixtures", file: "owl" });
    const window = {
      loadURL: mock(async (_url: string) => {}),
    };

    await loadURL(window as never, "/detail?view=detail");

    expect(window.loadURL).toHaveBeenCalledWith(
      "app://-/owl.html/detail?view=detail",
    );
  });
});

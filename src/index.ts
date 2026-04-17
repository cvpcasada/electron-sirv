import path from "node:path";
import electron, { BrowserWindow } from "electron";
import { serve as sirv, ServeOptions } from "./serve.js";

/**
Static file serving for Electron apps.

@example
```
import {app, BrowserWindow} from 'electron';
import serve from 'electron-serve';

const loadURL = serve({directory: 'renderer'});

let mainWindow;

(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow();

	await loadURL(mainWindow);

	// Or optionally with a path segment and query string.
	await loadURL(mainWindow, '/settings?tab=profile');

	// The above is equivalent to this:
	await mainWindow.loadURL('app://-/settings?tab=profile');
	// The `-` is just the required hostname.
})();
```
*/
export function serve(options: Options | URL): LoadURL {
  if (options instanceof URL) {
    const base = new URL(options);

    return async (browserWindow, pathSegment) => {
      if (!pathSegment) {
        await browserWindow.loadURL(base.toString());
        return;
      }

      await browserWindow.loadURL(new URL(pathSegment, base).toString());
    };
  }

  options = {
    isCorsEnabled: true,
    scheme: "app",
    hostname: "-",
    file: "index",
    ...options,
  };

  if (!options.directory) {
    throw new Error("The `directory` option is required");
  }

  options.directory = path.resolve(
    electron.app.getAppPath(),
    options.directory,
  );

  electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: options.scheme!,
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: options.isCorsEnabled,
      },
    },
  ]);

  electron.app.on("ready", () => {
    const session = options.partition
      ? electron.session.fromPartition(options.partition)
      : electron.session.defaultSession;

    session.protocol.handle(
      options.scheme!,
      sirv(options.directory, {
        ...options,
        single: options.single ?? `${options.file}.html`,
      }),
    );
  });

  return async (browserWindow, pathSegment) => {
    const pathname =
      options.file && options.file !== "index" ? `/${options.file}.html` : "";
    await browserWindow.loadURL(
      `${options.scheme}://${options.hostname}${pathname}${pathSegment ?? ""}`,
    );
  };
}

export type Options = {
  /**
	The directory to serve, relative to the app root directory.
	*/
  directory: string;

  /**
	Custom scheme. For example, `foo` results in your `directory` being available at `foo://-`.

	@default 'app'
	*/
  scheme?: string;

  /**
	Custom hostname.

	@default '-'
	*/
  hostname?: string;

  /**
	Custom HTML filename. This gets appended with `'.html'`.

	@default 'index'
	*/
  file?: string;

  /**
	Whether [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) should be enabled.
	Useful for testing purposes.

	@default true
	*/
  isCorsEnabled?: boolean;

  /**
	The [partition](https://electronjs.org/docs/api/session#sessionfrompartitionpartition-options) where the protocol should be installed, if not using Electron's default partition.

	@default electron.session.defaultSession
	*/
  partition?: string;
} & ServeOptions;

/**
Load the index file in the window, optionally with a path segment.
*/
export type LoadURL = (
  window: BrowserWindow,
  pathSegment?: string,
) => Promise<void>;

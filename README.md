# @cyca/electron-sirv

Static file serving for Electron apps.

`@cyca/electron-sirv` registers a custom Electron protocol and serves files from
your app directory using `sirv`-style static resolution.

It is inspired by `electron-serve`, but uses the newer `electron.protocol`
handler APIs and keeps the static serving layer aligned with `sirv`.

## Behavior Notes

This package keeps the Electron-facing API shape from `electron-serve`, but the
static file resolution and serving behavior is based on `sirv`.

That means SPA fallback behavior follows `sirv` semantics:

- extensionless unresolved routes like `/settings` can fall back to the SPA entry
- unresolved file-like routes like `/settings.html` do not fall back
- unresolved asset routes like `/logo.png` do not fall back

The `file` option is still supported at the Electron API layer, so you can load
an entry file other than `index.html`.

## Usage

```js
import {app, BrowserWindow} from 'electron';
import {serve} from '@cyca/electron-sirv';

const loadURL = serve({directory: 'renderer'});

let mainWindow;

(async () => {
	await app.whenReady();

	mainWindow = new BrowserWindow();

	await loadURL(mainWindow);

	// Or optionally with search parameters.
	await loadURL(mainWindow, {id: '4', foo: 'bar'});

	// The above is equivalent to this:
	await mainWindow.loadURL('app://-');
	// The `-` is just the required hostname
})();
```

To load a different HTML entry file, set `file`:

```js
const loadPopup = serve({directory: 'renderer', file: 'popup'});

await loadPopup(mainWindow);
// Loads `app://-/popup.html`
```

## API

### `serve(options)`

Creates a `loadURL(window, searchParameters?)` function for a BrowserWindow.

Important options:

- `directory`: Root directory to serve from, relative to `app.getAppPath()`
- `file`: Entry HTML file name without the `.html` extension. Defaults to `index`
- `single`: Enables SPA fallback behavior using `sirv` semantics

Notes:

- `file: 'popup'` makes `loadURL(window)` load `app://-/popup.html`
- `single: true` falls back to the configured entry for unresolved extensionless routes
- `single: 'admin.html'` uses `admin.html` as the SPA fallback target
- `searchParameters` can be a `URLSearchParams` or a record of string values

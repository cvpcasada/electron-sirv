# @cyca/electron-sirv

Static file serving for Electron apps.

See https://raw.githubusercontent.com/sindresorhus/electron-serve with changes that uses https://github.com/lukeed/sirv for resolving and serving files.

Uses the new electron.protocol handlers, and serves files with correct content-types.

See above links for api documentation. Options from both libraries are combined.

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
	await loadURL(mainWindow, {id: 4, foo: 'bar'});

	// The above is equivalent to this:
	await mainWindow.loadURL('app://-');
	// The `-` is just the required hostname
})();
```
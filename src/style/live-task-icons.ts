// For the live 'obsidian' theme: render Obsidian's own task checkboxes (one per
// state) so the exported boxes match the active theme exactly, whatever CSS
// technique it uses (glyph text, masks, gradients...). They're drawn in a
// hidden, transparent window carrying a copy of the app's CSS, so nothing
// appears on screen and the capture has real alpha.
// Desktop-only (Electron); returns null when capture isn't possible.

export interface CapturedIcon { dataUrl: string; w: number; h: number }
export type LiveTaskIcons = Record<string, CapturedIcon>;

interface NativeImageLike { isEmpty(): boolean; toDataURL(): string }
interface HiddenWindow {
	loadURL(url: string): Promise<void>;
	destroy(): void;
	isDestroyed(): boolean;
	webContents: {
		executeJavaScript(code: string): Promise<unknown>;
		capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<NativeImageLike>;
	};
}
interface ElectronLike {
	remote?: { BrowserWindow: new (options: Record<string, unknown>) => HiddenWindow };
}
interface ProbeRect { task: string; left: number; top: number; width: number; height: number }

// Our task names (parser.ts data-pub-task) → the markdown status character.
const STATES: Record<string, string> = {
	todo: ' ', done: 'x', 'in-progress': '/', cancelled: '-', rescheduled: '>', question: '?', important: '!',
};
const PAD = 1;
const SCALE = 2; // the hidden window renders at 1x, so zoom for a crisp PNG
const WINDOW = { width: 800, height: 120 };
const PAINT_RETRIES = 10;
const PAINT_WAIT_MS = 50;

let cache: LiveTaskIcons | null = null;

/** Drop cached captures — call when Obsidian's CSS changes (theme, mode, snippets). */
export function invalidateLiveTaskIcons(): void {
	cache = null;
}

function electron(): ElectronLike | null {
	try {
		const req = (globalThis as unknown as { require?: (m: string) => unknown }).require;
		return req ? (req('electron') as ElectronLike) : null;
	} catch {
		return null;
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function appCss(): string {
	return Array.from(document.styleSheets).map((sheet) => {
		try {
			return Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
		} catch {
			return ''; // cross-origin sheet
		}
	}).join('\n');
}

/** Same structure Obsidian renders in reading view, so theme selectors match. */
function probeHtml(): string {
	const items = Object.entries(STATES).map(([task, ch]) => {
		const checked = ch !== ' ';
		return `<li class="task-list-item${checked ? ' is-checked' : ''}" data-task="${ch}">` +
			`<input class="task-list-item-checkbox" type="checkbox" data-pub="${task}" data-task="${ch}"${checked ? ' checked' : ''}></li>`;
	}).join('');
	return `<div class="markdown-preview-view markdown-rendered" style="width: fit-content; height: fit-content; padding: 4px; zoom: ${SCALE};">` +
		`<ul class="contains-task-list" style="display: flex; gap: 12px; margin: 0; padding-left: 24px;">${items}</ul></div>`;
}

/** Copies the app's CSS and state into the hidden page; returns each box's rect. */
function buildPage(): string {
	const root = document.documentElement;
	const css = `${appCss()}\nhtml, body, .markdown-preview-view { background: transparent !important; }`;
	return `(() => {
		const style = document.createElement('style');
		style.textContent = ${JSON.stringify(css)};
		document.head.appendChild(style);
		document.documentElement.className = ${JSON.stringify(root.className)};
		document.documentElement.style.cssText = ${JSON.stringify(root.style.cssText)};
		document.body.className = ${JSON.stringify(document.body.className)};
		document.body.style.cssText = ${JSON.stringify(document.body.style.cssText)};
		document.body.innerHTML = ${JSON.stringify(probeHtml())};
		return Array.from(document.querySelectorAll('input[data-pub]')).map((el) => {
			const r = el.getBoundingClientRect();
			return { task: el.dataset.pub, left: r.left, top: r.top, width: r.width, height: r.height };
		});
	})()`;
}

function hasVisiblePixel(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
	const { data } = ctx.getImageData(0, 0, width, height);
	for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
	return false;
}

/** Captures Obsidian's rendered checkbox for every task state, or null if unavailable. */
export async function captureLiveTaskIcons(): Promise<LiveTaskIcons | null> {
	if (cache) return cache;
	const BrowserWindow = electron()?.remote?.BrowserWindow;
	if (!BrowserWindow) return null;

	let win: HiddenWindow | null = null;
	try {
		win = new BrowserWindow({
			...WINDOW, show: false, frame: false, transparent: true,
			webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true },
		});
		await win.loadURL('about:blank');
		const rects = await win.webContents.executeJavaScript(buildPage()) as ProbeRect[];

		const canvas = document.createElement('canvas');
		canvas.width = WINDOW.width;
		canvas.height = WINDOW.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

		// The first frames can still be blank; retry until the boxes have painted.
		let painted = false;
		for (let i = 0; i < PAINT_RETRIES && !painted; i++) {
			await new Promise(r => window.setTimeout(r, PAINT_WAIT_MS));
			const shot = await win.webContents.capturePage({ x: 0, y: 0, ...WINDOW });
			if (shot.isEmpty()) continue;
			const img = await loadImage(shot.toDataURL());
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0);
			painted = hasVisiblePixel(ctx, canvas.width, canvas.height);
		}
		if (!painted) return null;

		const pad = PAD * SCALE;
		const result: LiveTaskIcons = {};
		for (const r of rects) {
			const crop = document.createElement('canvas');
			crop.width = Math.round(r.width + 2 * pad);
			crop.height = Math.round(r.height + 2 * pad);
			crop.getContext('2d')!.drawImage(
				canvas, Math.round(r.left - pad), Math.round(r.top - pad), crop.width, crop.height,
				0, 0, crop.width, crop.height,
			);
			result[r.task] = { dataUrl: crop.toDataURL('image/png'), w: crop.width / SCALE, h: crop.height / SCALE };
		}
		cache = result;
		return result;
	} catch {
		return null;
	} finally {
		if (win && !win.isDestroyed()) win.destroy();
	}
}

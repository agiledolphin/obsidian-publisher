// For the live 'obsidian' theme: screenshot Obsidian's own rendered task
// checkboxes (one per state) so the exported boxes match the active theme
// exactly, whatever CSS technique it uses (glyph text, masks, gradients...).
// Desktop-only (Electron capturePage); returns null when capture isn't possible.

export interface CapturedIcon { dataUrl: string; w: number; h: number }
export type LiveTaskIcons = Record<string, CapturedIcon>;

interface NativeImageLike { isEmpty(): boolean; toDataURL(): string }
interface ElectronLike {
	remote?: { getCurrentWebContents(): { capturePage(rect: { x: number; y: number; width: number; height: number }): Promise<NativeImageLike> } };
	webFrame?: { getZoomFactor(): number };
}

// Our task names (parser.ts data-pub-task) → the markdown status character.
const STATES: Record<string, string> = {
	todo: ' ', done: 'x', 'in-progress': '/', cancelled: '-', rescheduled: '>', question: '?', important: '!',
};
const PAD = 1;

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

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

type RGB = [number, number, number];

function parseRgb(css: string): RGB | null {
	const m = css.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
	if (!m || m[4] === '0') return null;
	return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Recover transparent pixels from two captures of the same content over two
 * known backgrounds. Per channel, captured = a·fg + (1−a)·bg, so
 * a = 1 − (c1 − c2) / (b1 − b2) and fg = (c1 − (1−a)·b1) / a. The two
 * backgrounds only need to differ by a modest amount (64 levels here), which
 * keeps the on-screen flash low-contrast instead of white-then-black.
 */
function matte(shot1: ImageData, shot2: ImageData, bg1: RGB, bg2: RGB, out: ImageData): void {
	for (let i = 0; i < out.data.length; i += 4) {
		let a = 0;
		for (let c = 0; c < 3; c++) a += 1 - (shot1.data[i + c]! - shot2.data[i + c]!) / (bg1[c]! - bg2[c]!);
		a = Math.max(0, Math.min(1, a / 3));
		out.data[i + 3] = Math.round(a * 255);
		for (let c = 0; c < 3; c++) {
			out.data[i + c] = a > 0 ? Math.max(0, Math.min(255, (shot1.data[i + c]! - (1 - a) * bg1[c]!) / a)) : 0;
		}
	}
}

/** Captures Obsidian's rendered checkbox for every task state, or null if unavailable. */
export async function captureLiveTaskIcons(): Promise<LiveTaskIcons | null> {
	if (cache) return cache;
	const el = electron();
	const wc = el?.remote?.getCurrentWebContents();
	if (!wc) return null;
	const zoom = el?.webFrame?.getZoomFactor() ?? 1;

	// Same structure Obsidian renders in reading view, so theme selectors
	// match — laid out as one compact row so a single screenshot per
	// background covers every state (the probe is on screen for ~2 frames).
	const wrap = document.body.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
	wrap.setCssStyles({ position: 'fixed', left: '0', top: '0', zIndex: '2147483647', padding: '4px', pointerEvents: 'none' });
	const ul = wrap.createEl('ul', { cls: 'contains-task-list' });
	ul.setCssStyles({ display: 'flex', gap: '12px', margin: '0', paddingLeft: '24px' });
	const boxes: [string, HTMLInputElement][] = Object.entries(STATES).map(([task, ch]) => {
		const li = ul.createEl('li', { cls: 'task-list-item' + (ch !== ' ' ? ' is-checked' : '') });
		li.setAttribute('data-task', ch);
		const cb = li.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox' });
		cb.setAttribute('data-task', ch);
		cb.checked = ch !== ' ';
		return [task, cb];
	});

	try {
		// First background: the probe's own reading-view background, so the
		// first shot looks like a few checkboxes appearing; the second is the
		// same color shifted 64 levels per channel (darker on light themes).
		const bg1 = parseRgb(getComputedStyle(wrap).backgroundColor) ?? [255, 255, 255];
		const bg2 = bg1.map(v => (v >= 128 ? v - 64 : v + 64)) as RGB;

		const rects = boxes.map(([, cb]) => cb.getBoundingClientRect());
		const left = Math.floor(Math.min(...rects.map(r => r.left)) - PAD);
		const top = Math.floor(Math.min(...rects.map(r => r.top)) - PAD);
		const right = Math.ceil(Math.max(...rects.map(r => r.right)) + PAD);
		const bottom = Math.ceil(Math.max(...rects.map(r => r.bottom)) + PAD);
		const area = {
			x: Math.round(left * zoom), y: Math.round(top * zoom),
			width: Math.round((right - left) * zoom), height: Math.round((bottom - top) * zoom),
		};

		const shoot = async (bg: RGB): Promise<HTMLImageElement | null> => {
			wrap.style.setProperty('background', `rgb(${bg.join(', ')})`, 'important');
			await nextFrame();
			await nextFrame();
			const img = await wc.capturePage(area);
			return img.isEmpty() ? null : loadImage(img.toDataURL());
		};
		const img1 = await shoot(bg1);
		const img2 = img1 && await shoot(bg2);
		wrap.remove();
		if (!img1 || !img2) return null;

		const canvas = document.createElement('canvas');
		canvas.width = img1.naturalWidth;
		canvas.height = img1.naturalHeight;
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(img1, 0, 0);
		const d1 = ctx.getImageData(0, 0, canvas.width, canvas.height);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img2, 0, 0);
		const d2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const out = ctx.createImageData(canvas.width, canvas.height);
		matte(d1, d2, bg1, bg2, out);
		ctx.putImageData(out, 0, 0);

		// Crop each checkbox (plus PAD) out of the row; the screenshot is in
		// device pixels, so scale CSS coordinates by its actual ratio.
		const scale = canvas.width / (right - left);
		const result: LiveTaskIcons = {};
		boxes.forEach(([task], i) => {
			const r = rects[i]!;
			const w = r.width + 2 * PAD;
			const h = r.height + 2 * PAD;
			const crop = document.createElement('canvas');
			crop.width = Math.round(w * scale);
			crop.height = Math.round(h * scale);
			crop.getContext('2d')!.drawImage(
				canvas,
				Math.round((r.left - PAD - left) * scale), Math.round((r.top - PAD - top) * scale), crop.width, crop.height,
				0, 0, crop.width, crop.height,
			);
			result[task] = { dataUrl: crop.toDataURL('image/png'), w, h };
		});
		cache = result;
		return result;
	} catch {
		return null;
	} finally {
		wrap.remove();
	}
}

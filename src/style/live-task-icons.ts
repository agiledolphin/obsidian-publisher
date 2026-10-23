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

/**
 * Recover a transparent PNG from two captures of the same pixels over white
 * and over black: alpha = 1 − (white − black), color = black / alpha.
 */
async function matte(onWhite: string, onBlack: string): Promise<string> {
	const [w, b] = await Promise.all([loadImage(onWhite), loadImage(onBlack)]);
	const canvas = document.createElement('canvas');
	canvas.width = w.naturalWidth;
	canvas.height = w.naturalHeight;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(w, 0, 0);
	const wd = ctx.getImageData(0, 0, canvas.width, canvas.height);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(b, 0, 0);
	const bd = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const out = ctx.createImageData(canvas.width, canvas.height);
	for (let i = 0; i < out.data.length; i += 4) {
		let a = 0;
		for (let c = 0; c < 3; c++) a += 255 - (wd.data[i + c]! - bd.data[i + c]!);
		a = Math.max(0, Math.min(255, a / 3));
		out.data[i + 3] = a;
		for (let c = 0; c < 3; c++) out.data[i + c] = a > 0 ? Math.min(255, (bd.data[i + c]! * 255) / a) : 0;
	}
	ctx.putImageData(out, 0, 0);
	return canvas.toDataURL('image/png');
}

/** Captures Obsidian's rendered checkbox for every task state, or null if unavailable. */
export async function captureLiveTaskIcons(): Promise<LiveTaskIcons | null> {
	if (cache) return cache;
	const el = electron();
	const wc = el?.remote?.getCurrentWebContents();
	if (!wc) return null;
	const zoom = el?.webFrame?.getZoomFactor() ?? 1;

	// Same structure Obsidian renders in reading view, so theme selectors match.
	const wrap = document.body.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
	wrap.setCssStyles({ position: 'fixed', left: '0', top: '0', zIndex: '2147483647', padding: '8px', pointerEvents: 'none' });
	const ul = wrap.createEl('ul', { cls: 'contains-task-list' });
	const boxes: [string, HTMLInputElement][] = Object.entries(STATES).map(([task, ch]) => {
		const li = ul.createEl('li', { cls: 'task-list-item' + (ch !== ' ' ? ' is-checked' : '') });
		li.setAttribute('data-task', ch);
		const cb = li.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox' });
		cb.setAttribute('data-task', ch);
		cb.checked = ch !== ' ';
		li.appendText('task');
		return [task, cb];
	});

	const shoot = async (bg: string): Promise<string[] | null> => {
		wrap.style.setProperty('background', bg, 'important');
		await nextFrame();
		await nextFrame();
		const shots: string[] = [];
		for (const [, cb] of boxes) {
			const r = cb.getBoundingClientRect();
			const img = await wc.capturePage({
				x: Math.round((r.left - PAD) * zoom), y: Math.round((r.top - PAD) * zoom),
				width: Math.round((r.width + 2 * PAD) * zoom), height: Math.round((r.height + 2 * PAD) * zoom),
			});
			if (img.isEmpty()) return null;
			shots.push(img.toDataURL());
		}
		return shots;
	};

	try {
		const white = await shoot('#ffffff');
		const black = white && await shoot('#000000');
		if (!white || !black) return null;
		const result: LiveTaskIcons = {};
		for (let i = 0; i < boxes.length; i++) {
			const [task, cb] = boxes[i]!;
			const r = cb.getBoundingClientRect();
			result[task] = { dataUrl: await matte(white[i]!, black[i]!), w: r.width + 2 * PAD, h: r.height + 2 * PAD };
		}
		cache = result;
		return result;
	} catch {
		return null;
	} finally {
		wrap.remove();
	}
}

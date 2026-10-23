// Task checkboxes as SVG <img>s: WeChat drops the text-less unchecked box and
// misplaces the glyph inside filled ones when they're styled <span>s.

const WHITE = '#ffffff';
const SIZE = 15;

const GLYPHS: Record<string, string> = {
	done: `<path d="M3.8 7.8 6.3 10.2 11.2 4.9" fill="none" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
	cancelled: `<path d="M4.2 7.5H10.8" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round"/>`,
	'in-progress': `<path d="M9.4 3.9 5.6 11.1" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round"/>`,
	rescheduled: `<path d="M6.3 4.2 9.5 7.5 6.3 10.8" fill="none" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
	question: `<path d="M5.4 5.7a2.15 2.15 0 1 1 3.1 1.9c-.75.4-1 .85-1 1.6" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round"/>` +
		`<circle cx="7.5" cy="11.3" r=".95" fill="${WHITE}"/>`,
	important: `<path d="M7.5 3.6V8.5" stroke="${WHITE}" stroke-width="1.9" stroke-linecap="round"/>` +
		`<circle cx="7.5" cy="11.2" r="1.05" fill="${WHITE}"/>`,
};

const TASK_SPAN_RE = /<span data-pub-task="([\w-]+)" style="([^"]*)">[^<]*<\/span>/g;

function boxSvg(task: string, style: string): string | null {
	if (task === 'todo') {
		const border = style.match(/border:\s*[\d.]+px solid ([^;]+)/)?.[1]?.trim();
		if (!border) return null;
		return `<rect x=".75" y=".75" width="13.5" height="13.5" rx="2.5" fill="none" stroke="${border}" stroke-width="1.5"/>`;
	}
	const bg = style.match(/background-color:\s*([^;]+)/)?.[1]?.trim();
	const glyph = GLYPHS[task];
	if (!bg || !glyph) return null;
	return `<rect width="${SIZE}" height="${SIZE}" rx="3" fill="${bg}"/>${glyph}`;
}

/** Replaces themed task-checkbox <span>s with SVG <img>s of the same box. Run after theming, before sanitizing. */
export function taskBoxesToImages(html: string): string {
	return html.replace(TASK_SPAN_RE, (full, task: string, style: string) => {
		const inner = boxSvg(task, style);
		if (!inner) return full;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${inner}</svg>`;
		// Positioned relative to the text baseline (inside a body-size
		// inline-block the <li> baseline-aligns with the task text), so it
		// tracks the text whatever line-height WeChat applies. -2px centers the
		// 15px box on the cap height; `middle` (x-height) read a bit low.
		// The trailing &nbsp; gives the wrapper a text baseline and the gap.
		return `<span style="flex-shrink: 0; display: inline-block; font-size: 16px; line-height: 1; margin-right: 4px;">` +
			`<img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="${SIZE}" height="${SIZE}" ` +
			`style="display: inline-block; vertical-align: -2px; width: ${SIZE}px; height: ${SIZE}px;">&nbsp;</span>`;
	});
}

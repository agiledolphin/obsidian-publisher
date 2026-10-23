import { sanitizeHTMLToDom } from 'obsidian';

/**
 * Reads theme CSS properties needed by the preview.
 * Returns a map of CSS custom property name → value to be set on the preview
 * container so that styles.css rules (which use var(--pub-*)) pick them up.
 */
export function readThemeVars(): Record<string, string> {
	const result: Record<string, string> = {};

	const viewEl = document.querySelector('.markdown-preview-view');
	if (!viewEl) return result;

	// Read mark (==highlight==) colors from the live theme context so the preview
	// matches Obsidian's reading view exactly, even if theme CSS uses scoped selectors
	// or !important that would override inline styles on the inserted DOM elements.
	const markProbe = document.createElement('mark');
	markProbe.textContent = 'X';
	markProbe.classList.add('publisher-offscreen');
	viewEl.appendChild(markProbe);
	try {
		const cs = getComputedStyle(markProbe);
		result['--pub-mark-bg']    = cs.backgroundColor;
		result['--pub-mark-color'] = cs.color;
	} finally {
		viewEl.removeChild(markProbe);
	}

	// Read strikethrough color from the live theme context.
	// Use <del> probe (sanitizeHTMLToDom converts <del> → <s>, so we read from <del>
	// which shares the same CSS rules as <s> in most themes).
	const delProbe = document.createElement('del');
	delProbe.textContent = 'X';
	delProbe.classList.add('publisher-offscreen');
	viewEl.appendChild(delProbe);
	try {
		result['--pub-del-color'] = getComputedStyle(delProbe).color;
	} finally {
		viewEl.removeChild(delProbe);
	}

	return result;
}

/**
 * Inserts rendered HTML into container and applies all theme-based post-processing:
 * live-theme mark/del colors. Line-heights are left exactly as converted
 * (the live theme's own line-height is already written in by the style
 * engine), so the preview matches what every copy entry puts on the clipboard.
 */
export function applyPreviewContent(
	container: HTMLElement,
	html: string,
	themeVars: Record<string, string>,
	theme?: string
): void {
	// sanitizeHTMLToDom strips data: URLs from img src attributes.
	// Extract them first, replace with a stable index attribute, then restore
	// via .src property assignment after sanitization (property writes bypass
	// the sanitizer which only processes the initial HTML string).
	const dataUrls: string[] = [];
	const safeHtml = html.replace(
		/<img([^>]*?)src="(data:[^"]+)"([^>]*?)>/g,
		(_m, before: string, dataUrl: string, after: string) => {
			const idx = dataUrls.push(dataUrl) - 1;
			return `<img${before}data-pub-src="${idx}"${after}>`;
		}
	);

	container.empty();
	container.appendChild(sanitizeHTMLToDom(safeHtml));

	container.querySelectorAll<HTMLImageElement>('img[data-pub-src]').forEach((img) => {
		const idx = parseInt(img.getAttribute('data-pub-src') ?? '', 10);
		if (!isNaN(idx) && dataUrls[idx]) img.src = dataUrls[idx];
		img.removeAttribute('data-pub-src');
	});

	for (const [prop, val] of Object.entries(themeVars)) {
		container.style.setProperty(prop, val);
	}

	// The frame's padding ring takes the content's own page background when
	// it has one (dark mode, static themes) so the two read as one surface;
	// only content with no background of its own (live theme, light mode)
	// falls back to styles.css's white, standing in for WeChat's article page.
	const root = container.firstElementChild as HTMLElement | null;
	const rootBg = root?.style.backgroundColor ?? '';
	if (rootBg) container.style.setProperty('background-color', rootBg);
	else container.style.removeProperty('background-color');

	// For the 'obsidian' theme, override mark and del colors with the live Obsidian
	// theme values so the preview matches reading view exactly.
	// For static themes (Catppuccin Latte etc.) the colors are already baked into
	// the HTML inline styles — applying live theme values would clobber them.
	if (theme === 'obsidian') {
		const markBg    = themeVars['--pub-mark-bg'];
		const markColor = themeVars['--pub-mark-color'];
		if (markBg || markColor) {
			container.querySelectorAll<HTMLElement>('mark').forEach((el) => {
				if (markBg)    el.style.setProperty('background-color', markBg,    'important');
				if (markColor) el.style.setProperty('color',            markColor, 'important');
			});
		}

		const delColor = themeVars['--pub-del-color'];
		if (delColor) {
			container.querySelectorAll<HTMLElement>('del, s').forEach((el) => {
				el.style.setProperty('color', delColor, 'important');
			});
		}
	}
}

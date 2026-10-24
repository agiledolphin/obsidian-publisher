import { sanitizeHTMLToDom } from 'obsidian';

/**
 * Inserts rendered HTML into container, as is: no preview-only restyling, so
 * the preview matches exactly what every copy entry puts on the clipboard.
 */
export function applyPreviewContent(container: HTMLElement, html: string): void {
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

	// The frame's padding ring takes the content's own page background when
	// it has one (dark mode, static themes) so the two read as one surface;
	// only content with no background of its own (live theme, light mode)
	// falls back to styles.css's white, standing in for WeChat's article page.
	const root = container.firstElementChild as HTMLElement | null;
	const rootBg = root?.style.backgroundColor ?? '';
	if (rootBg) container.style.setProperty('background-color', rootBg);
	else container.style.removeProperty('background-color');
}

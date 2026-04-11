/**
 * Writes rich-text HTML to the system clipboard.
 *
 * Strategy (in order of preference):
 *
 * 1. Modern ClipboardItem API — explicitly writes text/html to the system
 *    clipboard. This is the most reliable path in Electron/Chromium and is
 *    what WeChat's editor needs to receive styled HTML on paste.
 *
 * 2. Fallback: DOM execCommand('copy') — used only when ClipboardItem is
 *    unavailable. In Electron this path often writes only text/plain, which
 *    is why it doesn't work for styled paste in WeChat.
 */
/**
 * Writes rich-text HTML to the system clipboard via the ClipboardItem API.
 * Obsidian runs on Electron/Chromium where ClipboardItem is always available.
 */
export async function copyRichText(html: string): Promise<void> {
	// Wrap in a full HTML document so WeChat's paste handler parses inline
	// styles reliably (bare fragments can lose background-color etc.).
	const htmlBlob  = new Blob([wrapHtmlDocument(html)], { type: 'text/html' });
	const textBlob  = new Blob([htmlToPlainText(html)],   { type: 'text/plain' });
	await navigator.clipboard.write([
		new ClipboardItem({
			'text/html':  htmlBlob,
			'text/plain': textBlob,
		}),
	]);
}

/**
 * Wraps an HTML fragment in a complete HTML document.
 * Some paste targets (including WeChat's editor) parse inline styles more
 * reliably when the clipboard contains a full document rather than a fragment.
 */
function wrapHtmlDocument(fragment: string): string {
	return (
		`<!DOCTYPE html><html><head>` +
		`<meta charset="utf-8">` +
		`</head><body>${fragment}</body></html>`
	);
}

/**
 * Strips HTML tags to produce a plain-text fallback for the clipboard.
 * Uses regex to avoid DOM manipulation (no innerHTML).
 */
function htmlToPlainText(html: string): string {
	return html
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g,  '&')
		.replace(/&lt;/g,   '<')
		.replace(/&gt;/g,   '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g,  "'")
		.replace(/&nbsp;/g, ' ');
}

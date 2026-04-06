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
export async function copyRichText(html: string): Promise<void> {
	// ── Path 1: Modern Clipboard API ─────────────────────────────────────────
	if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
		try {
			// Wrap in a full HTML document so WeChat's paste handler can parse
			// styles reliably (bare fragments can lose background-color etc.).
			const htmlBlob  = new Blob([wrapHtmlDocument(html)], { type: 'text/html' });
			const textBlob  = new Blob([htmlToPlainText(html)],   { type: 'text/plain' });
			await navigator.clipboard.write([
				new ClipboardItem({
					'text/html':  htmlBlob,
					'text/plain': textBlob,
				}),
			]);
			return;
		} catch (e) {
			// Permission denied or API unavailable — fall through to legacy path
			console.warn('[ObsidianPublisher] ClipboardItem API failed, falling back:', e);
		}
	}

	// ── Path 2: DOM execCommand fallback ─────────────────────────────────────
	// The element must be appended to the document and NOT have opacity:0,
	// otherwise some Electron versions won't include text/html in the clipboard.
	const container = document.createElement('div');
	container.innerHTML = html;
	container.style.cssText =
		'position: fixed; left: -9999px; top: 0; ' +
		'width: 1px; height: 1px; overflow: hidden;';
	document.body.appendChild(container);

	try {
		const range = document.createRange();
		range.selectNodeContents(container);

		const sel = window.getSelection();
		if (!sel) throw new Error('无法访问选区 API');

		sel.removeAllRanges();
		sel.addRange(range);
		document.execCommand('copy');
		sel.removeAllRanges();
	} finally {
		document.body.removeChild(container);
	}
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
 */
function htmlToPlainText(html: string): string {
	const tmp = document.createElement('div');
	tmp.innerHTML = html;
	return tmp.textContent ?? tmp.innerText ?? '';
}

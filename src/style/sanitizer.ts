/**
 * Cleans HTML to be compatible with WeChat public account editor.
 *
 * WeChat strips: class, id, position CSS, data-* attrs, empty style attrs.
 */
export function sanitizeForWeChat(html: string): string {
	// Remove position-related CSS properties (WeChat ignores them anyway)
	html = html.replace(/\bposition\s*:\s*[^;}"]+;?/gi, '');

	// Remove class attributes
	html = html.replace(/\s+class="[^"]*"/gi, '');

	// Remove id attributes
	html = html.replace(/\s+id="[^"]*"/gi, '');

	// Remove data-* attributes
	html = html.replace(/\s+data-[\w-]+=(?:"[^"]*"|'[^']*')/gi, '');

	// Remove empty style attributes
	html = html.replace(/\s+style="[\s]*"/gi, '');

	// Collapse multiple spaces in style values (cosmetic)
	html = html.replace(/style="\s+/g, 'style="');

	return html;
}

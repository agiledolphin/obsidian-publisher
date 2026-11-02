/**
 * Cleans HTML to be compatible with WeChat public account editor.
 *
 * WeChat strips: class, id, position CSS, data-* attrs, empty style attrs.
 * data-ignore-dm stays: it's a WeChat attribute, read by its paste check.
 */
export function sanitizeForWeChat(html: string): string {
	// Remove position-related CSS properties (WeChat ignores them anyway)
	html = html.replace(/\bposition\s*:\s*[^;}"]+;?/gi, '');

	// Remove class attributes
	html = html.replace(/\s+class="[^"]*"/gi, '');

	// Remove id attributes
	html = html.replace(/\s+id="[^"]*"/gi, '');

	// Remove data-* attributes (our own markers), keeping WeChat's data-ignore-dm
	html = html.replace(/\s+data-(?!ignore-dm=)[\w-]+=(?:"[^"]*"|'[^']*')/gi, '');

	// Remove empty style attributes
	html = html.replace(/\s+style="[\s]*"/gi, '');

	// Collapse multiple spaces in style values (cosmetic)
	html = html.replace(/style="\s+/g, 'style="');

	return html;
}

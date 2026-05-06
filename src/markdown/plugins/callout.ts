import type MarkdownIt from 'markdown-it';

interface CalloutStyle {
	color: string;
	bg: string;
	icon: string;
}

const CALLOUT_STYLES: Record<string, CalloutStyle> = {
	note:      { color: '#448aff', bg: '#e8f0fe', icon: '📝' },
	tip:       { color: '#00c853', bg: '#e8f5e9', icon: '💡' },
	hint:      { color: '#00c853', bg: '#e8f5e9', icon: '💡' },
	warning:   { color: '#ff9800', bg: '#fff8e1', icon: '⚠️' },
	caution:   { color: '#ff9800', bg: '#fff8e1', icon: '⚠️' },
	danger:    { color: '#f44336', bg: '#ffebee', icon: '🔥' },
	error:     { color: '#f44336', bg: '#ffebee', icon: '❌' },
	info:      { color: '#2196f3', bg: '#e3f2fd', icon: 'ℹ️' },
	example:   { color: '#9c27b0', bg: '#f3e5f5', icon: '📋' },
	quote:     { color: '#607d8b', bg: '#f5f5f5', icon: '💬' },
	cite:      { color: '#607d8b', bg: '#f5f5f5', icon: '💬' },
	success:   { color: '#00c853', bg: '#e8f5e9', icon: '✅' },
	check:     { color: '#00c853', bg: '#e8f5e9', icon: '✅' },
	done:      { color: '#00c853', bg: '#e8f5e9', icon: '✅' },
	question:  { color: '#ff9800', bg: '#fff8e1', icon: '❓' },
	faq:       { color: '#ff9800', bg: '#fff8e1', icon: '❓' },
	failure:   { color: '#f44336', bg: '#ffebee', icon: '💥' },
	missing:   { color: '#f44336', bg: '#ffebee', icon: '💥' },
	bug:       { color: '#f44336', bg: '#ffebee', icon: '🐛' },
	abstract:  { color: '#00bcd4', bg: '#e0f7fa', icon: '📄' },
	summary:   { color: '#00bcd4', bg: '#e0f7fa', icon: '📄' },
	tldr:      { color: '#00bcd4', bg: '#e0f7fa', icon: '📄' },
	todo:      { color: '#ff9800', bg: '#fff8e1', icon: '📌' },
	important: { color: '#f44336', bg: '#ffebee', icon: '❗' },
};

const DEFAULT_STYLE: CalloutStyle = { color: '#448aff', bg: '#e8f0fe', icon: '📝' };

/**
 * Renders simple inline markdown in a callout title:
 * **bold** → <strong>, *italic* → <em>, `code` → <code>
 */
function renderTitleInline(text: string): string {
	return text
		.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*\n]+)\*/g,     '<em>$1</em>')
		.replace(/`([^`\n]+)`/g,       '<code style="font-family: monospace; font-size: 0.9em;">$1</code>');
}

/**
 * Converts Obsidian callout blocks to inline-styled <div> wrappers.
 *
 *   > [!note] Title text
 *   > Body content
 *
 * The plugin runs in two passes:
 *  1. Core rule  — detects callout pattern, tags blockquote_open token,
 *                  strips the header line from the inline token.
 *  2. Renderer   — blockquote_open / blockquote_close emit the styled divs.
 */
export function obsidianCalloutPlugin(md: MarkdownIt): void {

	// ── Pass 1: tag tokens ───────────────────────────────────────────────────
	md.core.ruler.push('callout', (state) => {
		const tokens = state.tokens;

		for (let i = 0; i < tokens.length; i++) {
			const bqOpen = tokens[i];
			if (!bqOpen || bqOpen.type !== 'blockquote_open') continue;

			// Find the first inline token inside this blockquote
			let inlineIdx = -1;
			for (let j = i + 1; j < tokens.length; j++) {
				const t = tokens[j];
				if (!t || t.type === 'blockquote_close') break;
				if (t.type === 'inline' && t.children) { inlineIdx = j; break; }
			}
			if (inlineIdx === -1) continue;

			const inlineToken = tokens[inlineIdx];
			if (!inlineToken) continue;

			const firstLine = inlineToken.content.split('\n')[0] ?? '';
			const m = firstLine.match(/^\[!(\w+)\][+-]?\s*(.*)?/);
			if (!m) continue;

			const type  = (m[1] ?? 'note').toLowerCase();
			const title = (m[2] ?? '').trim() || (type.charAt(0).toUpperCase() + type.slice(1));
			const style = CALLOUT_STYLES[type] ?? DEFAULT_STYLE;

			// Store all callout data in token.meta (avoids HTML-in-attribute issues)
			bqOpen.meta = {
				callout:    true,
				color:      style.color,
				bg:         style.bg,
				titleHtml:  `<span style="font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif; font-style: normal;">${style.icon}\uFE0F</span> ${renderTitleInline(title)}`,
			};

			// Strip the header line from inline token content
			const lines = inlineToken.content.split('\n');
			inlineToken.content = lines.slice(1).join('\n');

			// Strip the corresponding children (up to and including the first softbreak)
			if (inlineToken.children) {
				let cutAt = inlineToken.children.length; // no softbreak → remove all
				for (let k = 0; k < inlineToken.children.length; k++) {
					if (inlineToken.children[k]?.type === 'softbreak') {
						cutAt = k + 1;
						break;
					}
				}
				inlineToken.children = inlineToken.children.slice(cutAt);
			}
		}
		return false;
	});

	// ── Pass 2: render ───────────────────────────────────────────────────────

	md.renderer.rules['blockquote_open'] = (tokens, idx) => {
		const meta = tokens[idx]?.meta as Record<string, unknown> | undefined;

		if (!meta?.callout) {
			return (
				`<blockquote style="border-left: 2px solid #7c3aed; padding: 4px 16px; ` +
				`margin: 1em 0; color: #555; font-size: 15px;">`
			);
		}

		const color     = meta['color']     as string;
		const bg        = meta['bg']        as string;
		const titleHtml = meta['titleHtml'] as string;

		// Use <section> instead of <div> — WeChat's editor is more likely to
		// preserve background-color on <section> elements than on <div>.
		return (
			`<section style="background-color: ${bg}; border-radius: 4px; ` +
			`padding: 12px 16px; margin: 1em 0;">` +
			`<p style="font-weight: 600; margin: 0 0 8px 0; font-size: 15px; color: ${color}; line-height: 1.5;">${titleHtml}</p>`
		);
	};

	md.renderer.rules['blockquote_close'] = (tokens, idx) => {
		let depth = 0;
		for (let i = idx - 1; i >= 0; i--) {
			const t = tokens[i];
			if (!t) continue;
			if (t.type === 'blockquote_close') depth++;
			if (t.type === 'blockquote_open') {
				if (depth === 0) {
					const meta = t.meta as Record<string, unknown> | undefined;
					return meta?.callout ? '</section>' : '</blockquote>';
				}
				depth--;
			}
		}
		return '</blockquote>';
	};
}

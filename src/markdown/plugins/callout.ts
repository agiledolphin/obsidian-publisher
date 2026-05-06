import { getIcon } from 'obsidian';
import type MarkdownIt from 'markdown-it';

// ── Alias → canonical type ────────────────────────────────────────────────────
const CALLOUT_ALIASES: Record<string, string> = {
	summary:   'abstract',
	tldr:      'abstract',
	hint:      'tip',
	important: 'tip',
	check:     'success',
	done:      'success',
	help:      'question',
	faq:       'question',
	caution:   'warning',
	attention: 'warning',
	fail:      'failure',
	missing:   'failure',
	error:     'danger',
	cite:      'quote',
};

// ── Fallback values (used when CSS variables are absent) ──────────────────────
// RGB triplets match Obsidian's default theme.
const FALLBACK_RGB: Record<string, string> = {
	note:     '68, 138, 255',
	abstract: '0, 188, 212',
	info:     '33, 150, 243',
	todo:     '255, 152, 0',
	tip:      '0, 200, 83',
	success:  '0, 200, 83',
	question: '236, 168, 0',
	warning:  '236, 168, 0',
	failure:  '244, 67, 54',
	danger:   '244, 67, 54',
	bug:      '244, 67, 54',
	example:  '124, 77, 255',
	quote:    '96, 125, 139',
};

// Lucide icon names match Obsidian's built-in defaults for each callout type.
const FALLBACK_ICON: Record<string, string> = {
	note:     'lucide-pencil',
	abstract: 'lucide-clipboard-list',
	info:     'lucide-info',
	todo:     'lucide-check-circle-2',
	tip:      'lucide-flame',
	success:  'lucide-check',
	question: 'lucide-help-circle',
	warning:  'lucide-alert-triangle',
	failure:  'lucide-x',
	danger:   'lucide-zap',
	bug:      'lucide-bug',
	example:  'lucide-list',
	quote:    'lucide-quote',
};

// Emoji fallback in case getIcon() returns null (should be very rare).
const EMOJI_FALLBACK: Record<string, string> = {
	note: '📝', abstract: '📋', info: 'ℹ️', todo: '✔️', tip: '💡',
	success: '✅', question: '❓', warning: '⚠️', failure: '❌',
	danger: '🔥', bug: '🐛', example: '📌', quote: '💬',
};

// ── Per-session cache ─────────────────────────────────────────────────────────
type CachedStyle = { rgb: string; iconName: string };
const styleCache = new Map<string, CachedStyle>();

/**
 * Reads --callout-color and --callout-icon from the active theme via a DOM probe.
 * Falls back to hardcoded defaults. Results are cached for the session.
 */
function readCalloutStyle(type: string): CachedStyle {
	if (styleCache.has(type)) return styleCache.get(type)!;

	const fallbackRgb  = FALLBACK_RGB[type]  ?? '68, 138, 255';
	const fallbackIcon = FALLBACK_ICON[type] ?? 'lucide-pencil';

	const probe = document.createElement('div');
	probe.className = 'callout';
	probe.setAttribute('data-callout', type);
	probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;width:1px;height:1px;';
	document.body.appendChild(probe);

	let rgb = fallbackRgb, iconName = fallbackIcon;
	try {
		const cs = getComputedStyle(probe);
		rgb      = cs.getPropertyValue('--callout-color').trim() || fallbackRgb;
		iconName = cs.getPropertyValue('--callout-icon').trim()  || fallbackIcon;
	} finally {
		document.body.removeChild(probe);
	}

	const result = { rgb, iconName };
	styleCache.set(type, result);
	return result;
}

/**
 * Builds an <img> tag from a Lucide icon name, with the icon stroke set to
 * the given color and encoded as an SVG data URL.
 * Returns empty string if the icon cannot be found (caller falls back to emoji).
 */
function buildIconImg(iconName: string, color: string): string {
	try {
		const el = getIcon(iconName);
		if (!el) return '';
		const svg = el.cloneNode(true) as SVGElement;
		svg.setAttribute('width', '16');
		svg.setAttribute('height', '16');
		// Replace currentColor so it renders correctly as a data: URL image
		// (CSS color inheritance does not apply inside img src).
		const svgStr = svg.outerHTML.replace(/currentColor/g, color);
		const encoded = encodeURIComponent(svgStr);
		return (
			`<img src="data:image/svg+xml,${encoded}" width="16" height="16" ` +
			`style="display:inline-block;vertical-align:middle;margin-right:6px;">`
		);
	} catch {
		return '';
	}
}

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
 * Converts Obsidian callout blocks to inline-styled <section> wrappers.
 * Colors and icons are read from the active Obsidian theme via CSS variables.
 */
export function obsidianCalloutPlugin(md: MarkdownIt): void {

	// ── Pass 1: tag tokens ───────────────────────────────────────────────────
	md.core.ruler.push('callout', (state) => {
		const tokens = state.tokens;

		for (let i = 0; i < tokens.length; i++) {
			const bqOpen = tokens[i];
			if (!bqOpen || bqOpen.type !== 'blockquote_open') continue;

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

			const raw      = (m[1] ?? 'note').toLowerCase();
			const canonical = CALLOUT_ALIASES[raw] ?? raw;
			const title    = (m[2] ?? '').trim() || (canonical.charAt(0).toUpperCase() + canonical.slice(1));

			const { rgb, iconName } = readCalloutStyle(canonical);
			const color = `rgb(${rgb})`;

			// Build icon HTML: prefer Lucide SVG, fall back to emoji.
			const iconHtml = buildIconImg(iconName, color)
				|| `<span style="font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif;font-style:normal;">${EMOJI_FALLBACK[canonical] ?? '📝'}</span>`;

			bqOpen.meta = {
				callout:   true,
				color,
				bg:        `rgba(${rgb}, 0.1)`,
				titleHtml: `${iconHtml}${renderTitleInline(title)}`,
			};

			// Strip the header line from inline token content.
			inlineToken.content = inlineToken.content.split('\n').slice(1).join('\n');

			// Strip the corresponding children up to and including the first softbreak.
			if (inlineToken.children) {
				let cutAt = inlineToken.children.length;
				for (let k = 0; k < inlineToken.children.length; k++) {
					if (inlineToken.children[k]?.type === 'softbreak') { cutAt = k + 1; break; }
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

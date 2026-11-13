import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type { Delimiter } from 'markdown-it/lib/rules_inline/state_inline.mjs';

export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

const HIGHLIGHT_MARKER = 0x3D; // '='

/** Obsidian 1.15+ colored highlight emoji prefixes. */
const HIGHLIGHT_EMOJI_ENTRIES: ReadonlyArray<[string, HighlightColor]> = [
	['🔴', 'red'],
	['🟥', 'red'],
	['🟠', 'orange'],
	['🟧', 'orange'],
	['🟡', 'yellow'],
	['🟨', 'yellow'],
	['🟢', 'green'],
	['🟩', 'green'],
	['🔵', 'blue'],
	['🟦', 'blue'],
	['🟣', 'purple'],
	['🟪', 'purple'],
];

/** Default light-mode background tints (used by static themes and as fallback). */
export const DEFAULT_HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
	red:    'rgba(233, 49, 71, 0.2)',
	orange: 'rgba(236, 117, 0, 0.2)',
	yellow: 'rgba(224, 172, 0, 0.2)',
	green:  'rgba(8, 185, 78, 0.2)',
	blue:   'rgba(0, 122, 255, 0.2)',
	purple: 'rgba(120, 82, 238, 0.2)',
};

function tokenizeHighlight(state: StateInline, silent: boolean): boolean {
	const start = state.pos;
	if (state.src.charCodeAt(start) !== HIGHLIGHT_MARKER) return false;
	if (silent) return false;

	const scanned = state.scanDelims(start, true);
	let len = scanned.length;
	if (len < 2) return false;

	if (len % 2) {
		const token = state.push('text', '', 0);
		token.content = '=';
		len--;
	}

	for (let i = 0; i < len; i += 2) {
		const token = state.push('text', '', 0);
		token.content = '==';
		state.delimiters.push({
			marker: HIGHLIGHT_MARKER,
			length: 0,
			token: state.tokens.length - 1,
			end: -1,
			open: scanned.can_open,
			close: scanned.can_close,
		});
	}

	state.pos += scanned.length;
	return true;
}

function pairHighlightDelimiters(state: StateInline, delimiters: Delimiter[]): void {
	const openers: number[] = [];
	for (let i = 0; i < delimiters.length; i++) {
		const delim = delimiters[i];
		if (!delim || delim.marker !== HIGHLIGHT_MARKER) continue;

		if (delim.close && openers.length > 0) {
			const openIdx = openers.pop()!;
			const startDelim = delimiters[openIdx];
			if (!startDelim) continue;

			const startToken = state.tokens[startDelim.token];
			const endToken = state.tokens[delim.token];
			if (!startToken || !endToken) continue;

			startToken.type = 'mark_open';
			startToken.tag = 'mark';
			startToken.nesting = 1;
			startToken.markup = '==';
			startToken.content = '';

			endToken.type = 'mark_close';
			endToken.tag = 'mark';
			endToken.nesting = -1;
			endToken.markup = '==';
			endToken.content = '';

			const first = state.tokens[startDelim.token + 1];
			if (first && first.type === 'text') {
				for (const [emoji, color] of HIGHLIGHT_EMOJI_ENTRIES) {
					if (first.content.startsWith(emoji)) {
						startToken.attrSet('data-highlight', color);
						first.content = first.content.slice(emoji.length);
						break;
					}
				}
			}
		} else if (delim.open) {
			openers.push(i);
		}
	}
}

function postProcessHighlight(state: StateInline): boolean {
	pairHighlightDelimiters(state, state.delimiters);
	for (const meta of state.tokens_meta) {
		if (meta?.delimiters) pairHighlightDelimiters(state, meta.delimiters);
	}
	return false;
}

/**
 * Converts ==highlighted text== (including ==🔴colored== and inline links/code)
 * to <mark> with inline style.
 */
export function obsidianHighlightPlugin(md: MarkdownIt): void {
	md.inline.ruler.before('emphasis', 'highlight_mark', tokenizeHighlight);
	md.inline.ruler2.before('emphasis', 'highlight_mark', postProcessHighlight);

	md.renderer.rules['mark_open'] = (tokens, idx) => {
		const color = tokens[idx]?.attrGet('data-highlight') as HighlightColor | null;
		const bg = color ? DEFAULT_HIGHLIGHT_COLORS[color] : '#fff3b1';
		const attr = color ? ` data-highlight="${color}"` : '';
		return `<mark${attr} style="background-color: ${bg}; color: #1a1a1a; padding: 2px 4px; border-radius: 2px;">`;
	};

	md.renderer.rules['mark_close'] = () => '</mark>';
}

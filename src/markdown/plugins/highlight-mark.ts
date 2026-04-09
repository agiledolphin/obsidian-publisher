import type MarkdownIt from 'markdown-it';
import { splitTokensByRegex } from './utils';

/**
 * Converts ==highlighted text== to <mark> with inline style.
 */
export function obsidianHighlightPlugin(md: MarkdownIt): void {
	md.core.ruler.push('highlight_mark', (state) => {
		const Token = state.Token;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;

			token.children = splitTokensByRegex(
				token.children, Token, /==([^=\n]+)==/g,
				(match) => {
					const open = new Token('html_inline', '', 0);
					open.content = '<mark style="background-color: #fff3b1; padding: 2px 4px; border-radius: 2px;">';
					const content = new Token('text', '', 0);
					content.content = match[1] ?? '';
					const close = new Token('html_inline', '', 0);
					close.content = '</mark>';
					return [open, content, close];
				},
			);
		}
		return false;
	});
}

import type MarkdownIt from 'markdown-it';
import { splitTokensByRegex } from './utils';

/**
 * Converts ~~strikethrough~~ to <del> tag.
 */
export function obsidianStrikethroughPlugin(md: MarkdownIt): void {
	md.core.ruler.push('strikethrough', (state) => {
		const Token = state.Token;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;

			token.children = splitTokensByRegex(
				token.children, Token, /~~([^~\n]+)~~/g,
				(match) => {
					const open = new Token('html_inline', '', 0);
					open.content = '<del style="color: #999;">';
					const content = new Token('text', '', 0);
					content.content = match[1] ?? '';
					const close = new Token('html_inline', '', 0);
					close.content = '</del>';
					return [open, content, close];
				},
			);
		}
		return false;
	});
}

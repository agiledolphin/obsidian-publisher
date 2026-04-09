import type MarkdownIt from 'markdown-it';
import { splitTokensByRegex } from './utils';

/**
 * Converts [[WikiLinks]] and [[Link|Display]] to plain text.
 */
export function obsidianWikiLinkPlugin(md: MarkdownIt): void {
	md.core.ruler.push('wikilink', (state) => {
		const Token = state.Token;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;

			token.children = splitTokensByRegex(
				token.children, Token, /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
				(match) => {
					const display = new Token('text', '', 0);
					display.content = (match[2] ?? match[1] ?? '').trim();
					return [display];
				},
			);
		}
		return false;
	});
}

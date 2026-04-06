import type MarkdownIt from 'markdown-it';

/**
 * Converts [[WikiLinks]] and [[Link|Display]] to plain text.
 */
export function obsidianWikiLinkPlugin(md: MarkdownIt): void {
	md.core.ruler.push('wikilink', (state) => {
		const Token = state.Token;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;

			const result: typeof token.children = [];
			const regex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

			for (const child of token.children) {
				if (child.type !== 'text') {
					result.push(child);
					continue;
				}

				const text = child.content;
				let lastIndex = 0;
				let match: RegExpExecArray | null;
				let hasMatch = false;
				regex.lastIndex = 0;

				while ((match = regex.exec(text)) !== null) {
					hasMatch = true;
					if (match.index > lastIndex) {
						const t = new Token('text', '', 0);
						t.content = text.slice(lastIndex, match.index);
						result.push(t);
					}
					const display = new Token('text', '', 0);
					const linkText = match[2] ?? match[1];
					display.content = (linkText ?? '').trim();
					result.push(display);
					lastIndex = match.index + match[0].length;
				}

				if (!hasMatch) {
					result.push(child);
				} else if (lastIndex < text.length) {
					const t = new Token('text', '', 0);
					t.content = text.slice(lastIndex);
					result.push(t);
				}
			}

			token.children = result;
		}
		return false;
	});
}

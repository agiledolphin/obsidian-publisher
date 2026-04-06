import type MarkdownIt from 'markdown-it';

/**
 * Converts ~~strikethrough~~ to <del> tag.
 */
export function obsidianStrikethroughPlugin(md: MarkdownIt): void {
	md.core.ruler.push('strikethrough', (state) => {
		const Token = state.Token;

		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;

			const result: typeof token.children = [];
			const regex = /~~([^~\n]+)~~/g;

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

					const open = new Token('html_inline', '', 0);
					open.content = '<del style="color: #999;">';
					result.push(open);

					const content = new Token('text', '', 0);
					content.content = match[1] ?? '';
					result.push(content);

					const close = new Token('html_inline', '', 0);
					close.content = '</del>';
					result.push(close);

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

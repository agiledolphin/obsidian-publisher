/**
 * Shared utility for inline regex-splitting plugins (highlight, strikethrough, wikilink).
 *
 * Iterates over every text child of every inline token, splits matching text by
 * `regex`, and lets the caller emit replacement tokens for each match via `expand`.
 * Non-matching text and non-text children are kept unchanged.
 *
 * @param children  existing children array from an inline token
 * @param Token     markdown-it Token constructor (from state.Token)
 * @param regex     pattern with the `g` flag
 * @param expand    called for each match; returns tokens to insert in its place
 */
export function splitTokensByRegex<T extends { type: string; content: string }>(
	children: T[],
	Token: new (type: string, tag: string, nesting: 0 | 1 | -1) => T,
	regex: RegExp,
	expand: (match: RegExpExecArray) => T[],
): T[] {
	const result: T[] = [];

	for (const child of children) {
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
			result.push(...expand(match));
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

	return result;
}

import type MarkdownIt from 'markdown-it';

/**
 * Converts GFM task list items:
 *   - [ ] todo   → ☐ todo
 *   - [x] done   → ✅ ~~done~~
 */
export function obsidianTaskListPlugin(md: MarkdownIt): void {
	md.core.ruler.push('task_list', (state) => {
		const tokens = state.tokens;

		for (let i = 0; i < tokens.length; i++) {
			const tok = tokens[i];
			if (!tok || tok.type !== 'list_item_open') continue;

			for (let j = i + 1; j < tokens.length; j++) {
				const inner = tokens[j];
				if (!inner) break;
				if (inner.type === 'list_item_close') break;
				if (inner.type !== 'inline' || !inner.children?.length) continue;

				const firstChild = inner.children[0];
				if (!firstChild || firstChild.type !== 'text') break;

				const text = firstChild.content;
				const taskPatterns: Array<[RegExp, string]> = [
					[/^\[ \]\s/,   'todo'],
					[/^\[[xX]\]\s/, 'done'],
					[/^\[\/\]\s/,  'in-progress'],
					[/^\[-\]\s/,   'cancelled'],
					[/^\[>\]\s/,   'rescheduled'],
					[/^\[\?\]\s/,  'question'],
					[/^\[!\]\s/,   'important'],
				];
				for (const [pattern, taskType] of taskPatterns) {
					if (pattern.test(text)) {
						tok.attrSet('data-task', taskType);
						firstChild.content = text.replace(pattern, '');
						break;
					}
				}
				break;
			}
		}
		return false;
	});
}

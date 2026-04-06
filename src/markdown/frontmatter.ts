export interface FrontmatterResult {
	metadata: Record<string, string>;
	body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { metadata: {}, body: content };

	const metadata: Record<string, string> = {};
	for (const line of match[1]?.split('\n') ?? []) {
		const idx = line.indexOf(':');
		if (idx > 0) {
			const key = line.slice(0, idx).trim();
			const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
			if (key) metadata[key] = value;
		}
	}

	return { metadata, body: content.slice(match[0]?.length ?? 0) };
}

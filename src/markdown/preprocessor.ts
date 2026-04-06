import { TFile, Vault, MetadataCache } from 'obsidian';
import { parseFrontmatter } from './frontmatter';
import { logger } from '../utils/logger';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'tif']);
const MAX_EMBED_DEPTH = 3;

/**
 * Pre-processes Obsidian-specific syntax that markdown-it cannot handle natively.
 *
 * Handles:
 *   ![[image.png]]           → ![image](image.png)
 *   ![[image.png|300]]       → <img src="image.png" width="300" style="...">
 *   ![[note.md]]             → expanded note body (recursive, max depth 3)
 *   ![[note]]                → same (extension optional)
 *   ![[note#heading]]        → expand note body (heading anchor ignored for now)
 */
export async function preprocessEmbeds(
	markdown: string,
	sourcePath: string,
	vault: Vault,
	metadataCache: MetadataCache,
	depth = 0
): Promise<string> {
	if (depth >= MAX_EMBED_DEPTH) {
		logger.warn(`Max embed depth (${MAX_EMBED_DEPTH}) reached at: ${sourcePath}`);
		return markdown;
	}

	// Collect all embeds first to avoid regex mutation issues during replacement
	const embedRegex = /!\[\[([^\]]+)\]\]/g;
	const embeds: Array<{ full: string; linkText: string }> = [];
	let m: RegExpExecArray | null;

	while ((m = embedRegex.exec(markdown)) !== null) {
		embeds.push({ full: m[0] ?? '', linkText: m[1] ?? '' });
	}

	if (embeds.length === 0) return markdown;

	let result = markdown;

	for (const { full, linkText } of embeds) {
		// Parse link text: "path#anchor|display" or "path|width" etc.
		const [pathPart, displayPart] = splitFirst(linkText, '|');
		const [filePath] = splitFirst(pathPart ?? '', '#');
		const cleanPath = (filePath ?? '').trim();

		const ext = cleanPath.split('.').pop()?.toLowerCase() ?? '';

		if (IMAGE_EXTS.has(ext)) {
			// ── Image embed ──────────────────────────────────────────
			const altText = displayPart?.trim() || stripExtension(cleanPath.split('/').pop() ?? cleanPath);
			const widthNum = displayPart ? parseInt(displayPart, 10) : NaN;

			if (!isNaN(widthNum)) {
				// ![[image.png|300]] → constrained-width inline img
				result = result.replace(
					full,
					`<img src="${cleanPath}" alt="${altText}" style="max-width: ${widthNum}px; display: block; margin: 1em auto; border-radius: 4px;">`
				);
			} else {
				// ![[image.png]] or ![[image.png|alt]] → standard markdown image
				result = result.replace(full, `![${altText}](${cleanPath})`);
			}
		} else {
			// ── Note embed ───────────────────────────────────────────
			// Resolve via MetadataCache (handles Obsidian's link resolution)
			const resolvedFile = metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);

			if (resolvedFile instanceof TFile && resolvedFile.extension === 'md') {
				let noteContent = await vault.read(resolvedFile);

				// Strip frontmatter from embedded notes
				const { body } = parseFrontmatter(noteContent);
				noteContent = body;

				// Recursively resolve nested embeds
				noteContent = await preprocessEmbeds(
					noteContent,
					resolvedFile.path,
					vault,
					metadataCache,
					depth + 1
				);

				// Wrap in a horizontal-rule-separated block
				result = result.replace(full, `\n\n---\n\n${noteContent}\n\n---\n\n`);
			} else {
				logger.warn(`Embed not found: ${cleanPath} (referenced from ${sourcePath})`);
				result = result.replace(full, `*(嵌入内容未找到：${cleanPath})*`);
			}
		}
	}

	return result;
}

/**
 * Removes standalone Obsidian #tags from markdown body text.
 * Preserves:
 *   - Lines starting with # (headings)
 *   - Tags inside code blocks (fenced or indented)
 *   - Tags inside inline code spans
 */
export function removeTags(markdown: string): string {
	const lines = markdown.split('\n');
	const result: string[] = [];
	let inFencedBlock = false;

	for (const line of lines) {
		// Toggle fenced code block state
		if (/^```/.test(line) || /^~~~/.test(line)) {
			inFencedBlock = !inFencedBlock;
			result.push(line);
			continue;
		}

		if (inFencedBlock) {
			result.push(line);
			continue;
		}

		// Skip heading lines — don't touch them
		if (/^\s*#+\s/.test(line)) {
			result.push(line);
			continue;
		}

		// Remove inline tags: space/#word or start-of-string/#word
		// Avoid removing tags inside backtick spans (simple heuristic: skip if inside `...`)
		const cleaned = removeInlineTags(line);
		result.push(cleaned);
	}

	return result.join('\n');
}

/**
 * Removes #tags from a single line, preserving content inside `backticks`.
 */
function removeInlineTags(line: string): string {
	// Split by backtick spans to avoid touching code
	const parts = line.split(/(`[^`]*`)/);
	return parts.map((part, i) => {
		// Odd indices are backtick spans — don't touch
		if (i % 2 === 1) return part;
		// Remove #tag patterns preceded by space, start-of-string, or open paren
		return part.replace(/(^|[\s(])#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5/_-]*)/g, '$1');
	}).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function splitFirst(str: string, sep: string): [string, string | undefined] {
	const idx = str.indexOf(sep);
	if (idx === -1) return [str, undefined];
	return [str.slice(0, idx), str.slice(idx + 1)];
}

function stripExtension(filename: string): string {
	const dotIdx = filename.lastIndexOf('.');
	return dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
}

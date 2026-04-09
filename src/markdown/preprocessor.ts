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
			// Resolve via MetadataCache so Obsidian's link logic is respected.
			// Always emit <img> directly (not markdown syntax) to avoid URL-encoding
			// issues with spaces in filenames like "Pasted image 2024.png".
			const resolvedImgFile = metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
			const resolvedSrc = resolvedImgFile instanceof TFile ? resolvedImgFile.path : cleanPath;

			const widthNum = displayPart ? parseInt(displayPart, 10) : NaN;
			const altText  = isNaN(widthNum)
				? (displayPart?.trim() || stripExtension(cleanPath.split('/').pop() ?? cleanPath))
				: stripExtension(cleanPath.split('/').pop() ?? cleanPath);

			// Escape double quotes to prevent breaking the HTML attribute.
			const escapedSrc = resolvedSrc.replace(/"/g, '&quot;');
			const escapedAlt = altText.replace(/"/g, '&quot;');

			if (!isNaN(widthNum)) {
				// ![[image.png|300]] → width-constrained image
				const imgTag = `<img src="${escapedSrc}" alt="${escapedAlt}" style="max-width: ${widthNum}px; display: block; margin: 1em auto; border-radius: 4px;">`;
				result = result.replace(full, () => imgTag);
			} else {
				// ![[image.png]] or ![[image.png|alt text]]
				const imgTag = `<img src="${escapedSrc}" alt="${escapedAlt}" style="max-width: 100%; border-radius: 4px; margin: 1em auto; display: block;">`;
				result = result.replace(full, () => imgTag);
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

				// Inline the embedded note seamlessly — matches Obsidian reading view behavior.
				// Use function form of replace() to prevent '$' in noteContent being
				// interpreted as replacement pattern references ($&, $`, $' etc.).
				result = result.replace(full, () => `\n\n${noteContent}\n\n`);
			} else {
				logger.warn(`Embed not found: ${cleanPath} (referenced from ${sourcePath})`);
				result = result.replace(full, () => `*(嵌入内容未找到：${cleanPath})*`);
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

// ── Footnotes ──────────────────────────────────────────────────────────────

/**
 * Processes Obsidian/Pandoc-style footnotes for WeChat-compatible output.
 *
 * WeChat does not support anchor links, so footnote references are rendered
 * as plain styled superscripts and definitions are collected into a section
 * at the bottom of the document.
 *
 * Syntax supported:
 *   [^label]        — inline reference
 *   [^label]: text  — definition, optionally followed by continuation lines
 *                     (non-empty lines that don't start a new [^label]:)
 */
export function processFootnotes(markdown: string): string {
	if (!/\[\^[^\]]+\]/.test(markdown)) return markdown;

	// Step 1: parse line by line to collect multi-line definitions.
	const definitions = new Map<string, string>(); // label → full text
	const bodyLines: string[] = [];
	const srcLines = markdown.split('\n');
	const defStart = /^\[\^([^\]]+)\]:\s*(.*)$/;

	let i = 0;
	while (i < srcLines.length) {
		const line = srcLines[i] ?? '';
		const m = line.match(defStart);
		if (m) {
			const label = (m[1] ?? '').trim();
			const textParts: string[] = [(m[2] ?? '').trim()];
			i++;
			// Collect continuation lines: non-empty and not starting a new definition.
			while (i < srcLines.length) {
				const next = srcLines[i] ?? '';
				if (next === '' || /^\[\^/.test(next)) break;
				textParts.push(next);
				i++;
			}
			definitions.set(label, textParts.filter(Boolean).join('\n'));
			bodyLines.push(''); // placeholder blank line where definition was
		} else {
			bodyLines.push(line);
			i++;
		}
	}

	if (definitions.size === 0) return markdown;

	let body = bodyLines.join('\n');

	// Step 2: assign sequential numbers by first appearance of references.
	const labelToNumber = new Map<string, number>();
	let counter = 0;
	body.replace(/\[\^([^\]]+)\]/g, (_: string, label: string) => {
		if (!labelToNumber.has(label.trim())) labelToNumber.set(label.trim(), ++counter);
		return '';
	});

	if (labelToNumber.size === 0) return markdown;

	// Step 3: replace references with styled superscripts (no links for WeChat).
	body = body.replace(/\[\^([^\]]+)\]/g, (_: string, label: string) => {
		const n = labelToNumber.get(label.trim());
		if (n === undefined) return `[^${label}]`;
		return `<sup style="color: #576b95; font-size: 0.75em; line-height: 1; vertical-align: super;">[${n}]</sup>`;
	});

	// Collapse extra blank lines left by removed definition blocks.
	body = body.replace(/\n{3,}/g, '\n\n').trimEnd();

	// Step 4: append footnote section.
	const items: string[] = [];
	for (const [label, n] of labelToNumber) {
		const raw = definitions.get(label) ?? '*(definition missing)*';
		// Replace newlines within multi-line definitions with <br> so line breaks
		// are preserved in the rendered output (markdown single \n is ignored).
		const text = raw.replace(/\n/g, '<br>&nbsp;&nbsp;&nbsp;&nbsp;');
		items.push(`**[${n}]** ${text}`);
	}
	const section = '\n\n---\n\n' + items.join('\n\n');
	return body + section;
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

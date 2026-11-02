import { TFile, Vault, arrayBufferToBase64, normalizePath } from 'obsidian';
import { getMimeType } from '../utils/mime';
import { logger } from '../utils/logger';

// Switching themes reconverts the note, so keep recent images instead of
// re-reading and re-encoding them. Bounded: a note can embed many large files.
const MAX_CACHE_CHARS = 64 * 1024 * 1024;

export class ImageEmbedder {
	private cache = new Map<string, { mtime: number; dataUrl: string }>();
	private cacheChars = 0;

	constructor(private vault: Vault) {}

	/**
	 * Scans all <img src="..."> tags in the HTML. If the src points to a local
	 * vault file, replaces it with a base64 data URL. External URLs are left as-is.
	 */
	async embedImages(html: string, fileDir: string): Promise<string> {
		const imgRegex = /<img([^>]*)\ssrc="([^"]+)"([^>]*)>/g;
		const tasks: Array<{ fullTag: string; src: string }> = [];

		let match: RegExpExecArray | null;
		while ((match = imgRegex.exec(html)) !== null) {
			const fullTag = match[0] ?? '';
			const src     = match[2] ?? '';
			if (!this.isExternalUrl(src)) {
				tasks.push({ fullTag, src });
			}
		}

		if (tasks.length === 0) return html;

		const results = await Promise.all(
			tasks.map(async ({ fullTag, src }) => {
				const dataUrl = await this.resolveLocalImage(src, fileDir);
				return {
					original:    fullTag,
					replacement: dataUrl ? fullTag.replace(`src="${src}"`, `src="${dataUrl}"`) : fullTag,
				};
			})
		);

		let output = html;
		for (const { original, replacement } of results) {
			output = output.replace(original, replacement);
		}
		return output;
	}

	private isExternalUrl(src: string): boolean {
		return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:');
	}

	private async resolveLocalImage(src: string, fileDir: string): Promise<string | null> {
		const candidates = [
			normalizePath(`${fileDir}/${src}`),
			normalizePath(src),
		];

		for (const candidate of candidates) {
			const file = this.vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) {
				return this.fileToBase64(file);
			}
		}

		// Last resort: search vault by filename only
		const fileName = src.split('/').pop() ?? src;
		const matches = this.vault.getFiles().filter(f => f.name === fileName);
		if (matches.length === 1) return this.fileToBase64(matches[0]!);
		if (matches.length > 1) {
			logger.warn(
				`Ambiguous image "${fileName}": ${matches.length} files found, using first match. ` +
				`Use full path or ![[path/to/image]] to disambiguate.`
			);
			return this.fileToBase64(matches[0]!);
		}

		logger.warn(`Could not resolve image: ${src}`);
		return null;
	}

	private async fileToBase64(file: TFile): Promise<string> {
		const cached = this.cache.get(file.path);
		if (cached?.mtime === file.stat.mtime) return cached.dataUrl;

		const base64  = arrayBufferToBase64(await this.vault.readBinary(file));
		const dataUrl = `data:${getMimeType(file.extension)};base64,${base64}`;

		if (cached) this.cacheChars -= cached.dataUrl.length;
		if (this.cacheChars + dataUrl.length > MAX_CACHE_CHARS) {
			this.cache.clear();
			this.cacheChars = 0;
		}
		this.cache.set(file.path, { mtime: file.stat.mtime, dataUrl });
		this.cacheChars += dataUrl.length;
		return dataUrl;
	}
}

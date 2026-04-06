import { TFile, Vault, normalizePath } from 'obsidian';
import { getMimeType } from '../utils/mime';
import { logger } from '../utils/logger';

export class ImageEmbedder {
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
		const found = this.vault.getFiles().find(f => f.name === fileName);
		if (found) return this.fileToBase64(found);

		logger.warn(`Could not resolve image: ${src}`);
		return null;
	}

	private async fileToBase64(file: TFile): Promise<string> {
		const buffer = await this.vault.readBinary(file);
		const bytes  = new Uint8Array(buffer);
		const len    = bytes.byteLength;

		let binary = '';
		for (let i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i] ?? 0);
		}

		const base64 = btoa(binary);
		const mime   = getMimeType(file.extension);
		return `data:${mime};base64,${base64}`;
	}
}

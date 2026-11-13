import { Notice, TFile, Vault, arrayBufferToBase64, normalizePath, requestUrl } from 'obsidian';
import { getMimeType, detectMimeType } from '../utils/mime';
import { rasterBufferToPng } from '../utils/svg-raster';
import { logger } from '../utils/logger';

// Switching themes reconverts the note, so keep recent images instead of
// re-reading and re-encoding them. Bounded: a note can embed many large files.
const MAX_CACHE_CHARS = 64 * 1024 * 1024;
const MAX_REMOTE_CONCURRENCY = 4;
const WECHAT_NATIVE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml']);

export class ImageEmbedder {
	private cache = new Map<string, { mtime: number; dataUrl: string }>();
	private cacheChars = 0;

	constructor(private vault: Vault) {}

	/**
	 * Scans all <img src="..."> tags in the HTML and replaces both local vault
	 * paths and external http(s) URLs with base64 data URLs so WeChat does not
	 * have to crawl external hosts on paste (which often fails on overseas CDNs,
	 * WAFs, or hotlink-protected servers).
	 */
	async embedImages(html: string, fileDir: string): Promise<string> {
		const imgRegex = /<img([^>]*)\ssrc="([^"]+)"([^>]*)>/g;
		const tasks: Array<{ fullTag: string; src: string }> = [];

		let match: RegExpExecArray | null;
		while ((match = imgRegex.exec(html)) !== null) {
			const fullTag = match[0] ?? '';
			const src     = match[2] ?? '';
			if (!src.startsWith('data:')) {
				tasks.push({ fullTag, src });
			}
		}

		if (tasks.length === 0) return html;

		// Deduplicate identical srcs and bound remote concurrency to avoid CDN throttling.
		const dataUrlBySrc = new Map<string, string | null>();
		const uniqueSrcs = [...new Set(tasks.map(t => t.src))];
		const localSrcs  = uniqueSrcs.filter(s => !this.isRemoteUrl(s));
		const remoteSrcs = uniqueSrcs.filter(s => this.isRemoteUrl(s));

		await Promise.all(
			localSrcs.map(async (src) => {
				dataUrlBySrc.set(src, await this.resolveLocalImage(src, fileDir));
			})
		);

		const failedRemoteUrls: string[] = [];
		for (let i = 0; i < remoteSrcs.length; i += MAX_REMOTE_CONCURRENCY) {
			const batch = remoteSrcs.slice(i, i + MAX_REMOTE_CONCURRENCY);
			await Promise.all(
				batch.map(async (src) => {
					const dataUrl = await this.resolveRemoteImage(src);
					dataUrlBySrc.set(src, dataUrl);
					if (!dataUrl) failedRemoteUrls.push(src);
				})
			);
		}

		if (failedRemoteUrls.length > 0) {
			new Notice(
				`⚠️ 有 ${failedRemoteUrls.length} 张外链图片下载失败，已保留原链接（粘贴到公众号可能失败）：\n` +
				failedRemoteUrls.slice(0, 3).join('\n'),
				8000
			);
		}

		let output = html;
		for (const { fullTag, src } of tasks) {
			const dataUrl = dataUrlBySrc.get(src);
			if (dataUrl) {
				const replacement = fullTag.replace(`src="${src}"`, () => `src="${dataUrl}"`);
				output = output.replace(fullTag, () => replacement);
			}
		}
		return output;
	}

	private isRemoteUrl(src: string): boolean {
		return src.startsWith('http://') || src.startsWith('https://');
	}

	private async resolveRemoteImage(src: string): Promise<string | null> {
		const url = src.replace(/&amp;/g, '&');
		const cached = this.cache.get(url);
		if (cached) return cached.dataUrl;

		const fetched = await this.fetchRemoteImage(url);
		if (!fetched) return null;

		const ext = (url.split('?')[0]?.split('#')[0]?.split('.').pop() ?? '').toLowerCase();
		const headerMime = fetched.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
		const fallbackMime = headerMime.startsWith('image/') ? headerMime : getMimeType(ext);
		const dataUrl = await this.bufferToDataUrl(fetched.buffer, fallbackMime);

		this.storeCache(url, 0, dataUrl);
		return dataUrl;
	}

	private async fetchRemoteImage(url: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
		// Prefer WeChat-native formats (PNG/JPEG/GIF) so CDNs like Akamai Image Manager
		// don't auto-negotiate WebP and force a slow, large Canvas PNG re-encode.
		const baseHeaders: Record<string, string> = {
			'Accept': 'image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.5',
		};
		const origin = (() => {
			try { return new URL(url).origin + '/'; }
			catch { return ''; }
		})();
		const attempts: Array<{ headers: Record<string, string>; delayMs: number }> = [
			{ headers: baseHeaders, delayMs: 0 },
			...(origin ? [{ headers: { ...baseHeaders, 'Referer': origin }, delayMs: 0 }] : []),
			{ headers: baseHeaders, delayMs: 400 },
			...(origin ? [{ headers: { ...baseHeaders, 'Referer': origin }, delayMs: 800 }] : []),
		];

		let lastErr: unknown;
		for (const { headers, delayMs } of attempts) {
			if (delayMs > 0) await new Promise<void>(r => setTimeout(r, delayMs));
			try {
				const res = await requestUrl({ url, headers });
				const contentType = res.headers['content-type'] ?? res.headers['Content-Type'] ?? '';
				const magic = detectMimeType(res.arrayBuffer);
				if (!magic && !contentType.toLowerCase().startsWith('image/')) {
					throw new Error(`Non-image response (${contentType || 'unknown'})`);
				}
				return { buffer: res.arrayBuffer, contentType };
			} catch (err) {
				lastErr = err;
			}
		}

		logger.warn(`Could not fetch remote image: ${url}`, lastErr);
		return null;
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

		const buffer  = await this.vault.readBinary(file);
		const dataUrl = await this.bufferToDataUrl(buffer, getMimeType(file.extension));

		this.storeCache(file.path, file.stat.mtime, dataUrl);
		return dataUrl;
	}

	private async bufferToDataUrl(buffer: ArrayBuffer, fallbackMime: string): Promise<string> {
		const mime = detectMimeType(buffer, fallbackMime) || 'image/png';
		if (!WECHAT_NATIVE_MIMES.has(mime)) {
			const pngDataUrl = await rasterBufferToPng(buffer, mime);
			if (pngDataUrl) return pngDataUrl;
		}
		return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
	}

	private storeCache(key: string, mtime: number, dataUrl: string): void {
		const prev = this.cache.get(key);
		if (prev) this.cacheChars -= prev.dataUrl.length;
		if (this.cacheChars + dataUrl.length > MAX_CACHE_CHARS) {
			this.cache.clear();
			this.cacheChars = 0;
		}
		this.cache.set(key, { mtime, dataUrl });
		this.cacheChars += dataUrl.length;
	}
}

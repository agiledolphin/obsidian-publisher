export function getMimeType(ext: string): string {
	const map: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
		bmp: 'image/bmp',
		tiff: 'image/tiff',
		tif: 'image/tiff',
	};
	return map[ext.toLowerCase()] ?? 'image/png';
}

/**
 * Detects an image's MIME type from its binary magic bytes, falling back to
 * `fallback` when the header is not recognized.
 */
export function detectMimeType(buffer: ArrayBuffer, fallback = ''): string {
	const b = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512));
	if (
		b.length >= 8 &&
		b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
		b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
	) {
		return 'image/png';
	}
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
		return 'image/jpeg';
	}
	if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
		return 'image/gif';
	}
	if (
		b.length >= 12 &&
		b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
		b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
	) {
		return 'image/webp';
	}
	if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) {
		return 'image/bmp';
	}
	if (
		b.length >= 4 && (
			(b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
			(b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
		)
	) {
		return 'image/tiff';
	}
	const head = new TextDecoder().decode(b).trimStart();
	if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
		return 'image/svg+xml';
	}
	return fallback;
}

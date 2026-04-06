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

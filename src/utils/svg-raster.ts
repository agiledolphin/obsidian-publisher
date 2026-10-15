/** Rasterizes an SVG string to a PNG data URL, drawn at `scale`× the given display size. */
export function rasterizeSvg(svg: string, w: number, h: number, scale = 2): Promise<string | null> {
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(w * scale);
			canvas.height = Math.round(h * scale);
			const ctx = canvas.getContext('2d');
			if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0, w, h);
			URL.revokeObjectURL(url);
			try {
				resolve(canvas.toDataURL('image/png'));
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
		img.src = url;
	});
}

// ── PNG size floor ──────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** Inserts a tEXt chunk before IEND so the file reaches `minBytes`; pixels are untouched. */
function padPng(bytes: Uint8Array, minBytes: number): Uint8Array {
	const header = new TextEncoder().encode('tEXtComment\0');
	const fillerLen = Math.max(0, minBytes - bytes.length - 12 - (header.length - 4));
	const typeAndData = new Uint8Array(header.length + fillerLen);
	typeAndData.set(header);
	typeAndData.fill(0x20, header.length); // spaces

	const chunk = new Uint8Array(12 + typeAndData.length - 4);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, typeAndData.length - 4);
	chunk.set(typeAndData, 4);
	view.setUint32(chunk.length - 4, crc32(typeAndData));

	const iend = bytes.length - 12; // IEND is always the last 12 bytes
	const out = new Uint8Array(bytes.length + chunk.length);
	out.set(bytes.subarray(0, iend));
	out.set(chunk, iend);
	out.set(bytes.subarray(iend), iend + chunk.length);
	return out;
}

const PNG_IMG_RE = /src="data:image\/png;base64,([^"]+)"/g;
const MIN_PNG_BYTES = 2048;

/**
 * WeChat drops images under roughly 1KB when a draft is saved (presumably
 * treated as tracking pixels/junk) — observed boundary: icons ≥1122B kept,
 * ≤999B dropped, same 32×32 dimensions either way. Small icons, the 橙心 flag
 * (a flat triangle compresses to ~600B) and short inline math all fall under
 * it. Pad any smaller PNG with a filler tEXt chunk; the image is unchanged.
 */
export function padSmallPngs(html: string): string {
	return html.replace(PNG_IMG_RE, (full, b64: string) => {
		if (b64.length * 3 / 4 >= MIN_PNG_BYTES) return full;
		const bin = atob(b64);
		const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
		const padded = padPng(bytes, MIN_PNG_BYTES);
		let s = '';
		for (const b of padded) s += String.fromCharCode(b);
		return `src="data:image/png;base64,${btoa(s)}"`;
	});
}

// ── SVG → PNG for <img> tags ────────────────────────────────────────────────

const SVG_IMG_RE = /<img([^>]*?)src="data:image\/svg\+xml,([^"]+)"([^>]*)>/g;

/** Display size of an <img>: inline style px first, then width/height attributes, then the SVG's own. */
function displaySize(attrs: string, svg: string): { w: number; h: number } {
	const px = (re: RegExp, s: string) => { const m = s.match(re); return m ? parseFloat(m[1]!) : NaN; };
	let w = px(/(?:^|[;"\s])width:\s*([\d.]+)px/, attrs);
	let h = px(/(?:^|[;"\s])height:\s*([\d.]+)px/, attrs);
	if (isNaN(w)) w = px(/\swidth="([\d.]+)"/, attrs);
	if (isNaN(h)) h = px(/\sheight="([\d.]+)"/, attrs);
	const root = svg.match(/<svg[^>]*>/)?.[0] ?? '';
	if (isNaN(w)) w = px(/\swidth="([\d.]+)"/, root);
	if (isNaN(h)) h = px(/\sheight="([\d.]+)"/, root);
	return { w: isNaN(w) ? 24 : w, h: isNaN(h) ? 24 : h };
}

/** Gives the SVG root an explicit width/height, so it renders at the target size instead of the 300×150 default. */
function withSize(svg: string, w: number, h: number): string {
	return svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
		const rest = attrs.replace(/\s(?:width|height)="[^"]*"/g, '');
		return `<svg${rest} width="${w}" height="${h}">`;
	});
}

/**
 * WeChat shows SVG data-URI <img>s in the editor right after paste, but drops
 * them when the draft is saved — its server re-hosts inline images and only
 * accepts raster formats. Rasterize every such <img> (heading flags/icons,
 * callout icons) to PNG at the same display size. Falls back to the original
 * SVG if rasterizing fails.
 */
export async function rasterizeSvgImages(html: string): Promise<string> {
	const matches = [...html.matchAll(SVG_IMG_RE)];
	if (matches.length === 0) return html;

	const cache = new Map<string, Promise<string | null>>();
	const pngs = await Promise.all(matches.map((m) => {
		const [, before = '', encoded = '', after = ''] = m;
		const svg = decodeURIComponent(encoded);
		const { w, h } = displaySize(before + after, svg);
		const key = `${w}x${h}:${encoded}`;
		let png = cache.get(key);
		if (!png) {
			png = rasterizeSvg(withSize(svg, w, h), w, h);
			cache.set(key, png);
		}
		return png;
	}));

	let i = 0;
	return html.replace(SVG_IMG_RE, (full, before: string, _encoded: string, after: string) => {
		const png = pngs[i++];
		return png ? `<img${before}src="${png}"${after}>` : full;
	});
}

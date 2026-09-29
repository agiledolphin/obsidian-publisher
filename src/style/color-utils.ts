/** Converts r/g/b decimal strings to a lowercase #rrggbb hex string. */
export function toHex6(r?: string, g?: string, b?: string): string {
	return '#' + [r ?? '0', g ?? '0', b ?? '0']
		.map(x => parseInt(x).toString(16).padStart(2, '0'))
		.join('');
}

/** Converts a #rrggbb hex string to an "r, g, b" triplet (Obsidian --callout-color format). */
export function hexToRgbTriplet(hex: string): string {
	const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (!m) return '0, 0, 0';
	return `${parseInt(m[1] ?? '00', 16)}, ${parseInt(m[2] ?? '00', 16)}, ${parseInt(m[3] ?? '00', 16)}`;
}

/**
 * Normalizes a computed CSS custom property value into an "r, g, b" triplet.
 * Most Obsidian themes define --callout-color as "r, g, b" per Obsidian's own
 * convention, but some (e.g. Minimal's Flexoki variant) define it as a plain
 * hex color instead — accept both, and fall back when neither parses.
 */
export function normalizeRgbTriplet(raw: string, fallback: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return fallback;
	if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(trimmed)) return trimmed;
	const hexMatch = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (hexMatch) {
		let hex = hexMatch[1] ?? '000';
		if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
		return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
	}
	return fallback;
}

/** Mixes two hex colors: fraction=0 → full hex1, fraction=1 → full hex2. */
export function mixColors(hex1: string, hex2: string, fraction: number): string {
	const m1 = hex1.match(/^#([0-9a-f]{6})$/i);
	const m2 = hex2.match(/^#([0-9a-f]{6})$/i);
	if (!m1 || !m2) return hex1;
	const h1 = m1[1] ?? '000000';
	const h2 = m2[1] ?? '000000';
	const r = Math.round(parseInt(h1.slice(0, 2), 16) * (1 - fraction) + parseInt(h2.slice(0, 2), 16) * fraction);
	const g = Math.round(parseInt(h1.slice(2, 4), 16) * (1 - fraction) + parseInt(h2.slice(2, 4), 16) * fraction);
	const b = Math.round(parseInt(h1.slice(4, 6), 16) * (1 - fraction) + parseInt(h2.slice(4, 6), 16) * fraction);
	return toHex6(String(r), String(g), String(b));
}

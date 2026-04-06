import { sanitizeForWeChat } from './sanitizer';
import { logger } from '../utils/logger';

export type ThemeName = 'light' | 'minimal' | 'obsidian';

export interface ObsidianVars {
	bgPrimary:   string;
	bgSecondary: string;
	bgBorder:    string;
	textNormal:  string;
	textMuted:   string;
	textFaint:   string;
	accent:      string;
	linkColor:   string;
	fontText:    string;
	// Per-level heading colors (--h1-color … --h5-color)
	h1Color:     string;
	h2Color:     string;
	h3Color:     string;
	h4Color:     string;
	h5Color:     string;
	// Code syntax highlight colors (from Obsidian --code-* variables)
	codeBackground: string;
	codeNormal:     string;
	codeComment:    string;
	codeKeyword:    string;
	codeFunction:   string;
	codeString:     string;
	codeValue:      string;
	codeTag:        string;
	codeProperty:   string;
	codeVariable:   string;
	codeInline:     string;
	// Callout accent colors (read from --callout-color per type)
	calloutNote:    string;
	calloutInfo:    string;
	calloutTip:     string;
	calloutWarning: string;
	calloutDanger:  string;
	calloutSuccess: string;
	calloutExample: string;
	calloutQuote:   string;
	calloutAbstract:string;
	calloutBlend:   number; // --callout-blend-factor, typically 0.1
}

// ── CSS variable resolution ─────────────────────────────────────────────────
//
// Obsidian themes (Blue Topaz, Minimal, etc.) use deeply nested CSS variables,
// e.g.  --background-primary: var(--color-base-00)
//       --color-base-00: #1e2030
//
// getPropertyValue('--background-primary') would return the raw string
// "var(--color-base-00)", NOT the final hex color.
//
// The reliable fix: create a temporary DOM element, apply the variable as a
// regular CSS property (color / background-color), then read the COMPUTED
// value. The browser resolves the entire variable chain for us.

function readComputedColor(varName: string, fallback: string): string {
	const el = document.createElement('div');
	el.style.cssText =
		`color: var(${varName}); position: fixed; left: -9999px; pointer-events: none; opacity: 0;`;
	document.body.appendChild(el);
	const raw = getComputedStyle(el).color;
	document.body.removeChild(el);
	return cssColorToHex(raw) ?? fallback;
}

function readComputedBg(varName: string, fallback: string): string {
	const el = document.createElement('div');
	el.style.cssText =
		`background-color: var(${varName}); position: fixed; left: -9999px; pointer-events: none; opacity: 0;`;
	document.body.appendChild(el);
	const raw = getComputedStyle(el).backgroundColor;
	document.body.removeChild(el);
	return cssColorToHex(raw) ?? fallback;
}

function readComputedFont(varName: string, fallback: string): string {
	const el = document.createElement('div');
	el.style.cssText =
		`font-family: var(${varName}); position: fixed; left: -9999px; pointer-events: none; opacity: 0;`;
	document.body.appendChild(el);
	const raw = getComputedStyle(el).fontFamily;
	document.body.removeChild(el);
	return raw.trim() || fallback;
}

/** Converts a computed CSS color string (rgb / rgba / hex) to lowercase hex. */
function cssColorToHex(color: string): string | null {
	color = color.trim();
	if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
	if (/^#[0-9a-f]{3}$/i.test(color)) {
		const [, r, g, b] = color;
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}

	const rgbaM = color.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
	if (rgbaM) {
		if (parseFloat(rgbaM[4] ?? '1') === 0) return null; // transparent
		return toHex6(rgbaM[1], rgbaM[2], rgbaM[3]);
	}

	const rgbM = color.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/);
	if (rgbM) return toHex6(rgbM[1], rgbM[2], rgbM[3]);

	return null;
}

function toHex6(r?: string, g?: string, b?: string): string {
	return '#' + [r ?? '0', g ?? '0', b ?? '0']
		.map(x => parseInt(x).toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Reads --callout-color for a given callout type.
 * Obsidian stores it as "r, g, b" (without #), e.g. "68, 138, 255".
 * Returns a #rrggbb hex string.
 */
function readCalloutAccent(type: string, fallback: string): string {
	const el = document.createElement('div');
	el.className = 'callout';
	el.setAttribute('data-callout', type);
	el.style.cssText = 'position: fixed; left: -9999px; pointer-events: none; opacity: 0;';
	document.body.appendChild(el);
	const raw = getComputedStyle(el).getPropertyValue('--callout-color').trim();
	document.body.removeChild(el);

	// Format: "r, g, b"
	const parts = raw.split(',').map(s => parseInt(s.trim(), 10));
	if (parts.length === 3 && parts.every(n => !isNaN(n))) {
		return toHex6(String(parts[0]), String(parts[1]), String(parts[2]));
	}
	return fallback;
}

/** Reads --callout-blend-factor (typically 0.1 in Obsidian). */
function readCalloutBlendFactor(): number {
	const el = document.createElement('div');
	el.className = 'callout';
	el.style.cssText = 'position: fixed; left: -9999px; pointer-events: none; opacity: 0;';
	document.body.appendChild(el);
	const raw = getComputedStyle(el).getPropertyValue('--callout-blend-factor').trim();
	document.body.removeChild(el);
	const n = parseFloat(raw);
	return isNaN(n) ? 0.1 : n;
}

/**
 * Reads a code syntax token color using two strategies:
 *
 * Strategy 1 — Reading view (Prism.js classes, most accurate):
 *   Obsidian's reading view renders code with Prism token classes like
 *   "token function", "token string", "token comment".
 *   Injects a span with those classes inside `.markdown-preview-view pre code`.
 *
 * Strategy 2 — Editor view fallback (CodeMirror compound classes):
 *   Injects a span with "cmClass cm-hmd-codeblock" inside the deepest
 *   available CM ancestor.
 */
function readCodeTokenColor(prismClass: string, cmClass: string, fallback: string): string {
	const hidden = 'position: absolute; left: -9999px; pointer-events: none; opacity: 0;';

	// Strategy 1: reading-view Prism tokens.
	// Prefer code.is-loaded — Obsidian adds this class after Prism highlights the
	// block, and some theme rules are scoped to .is-loaded .token.xxx.
	const previewCode =
		document.querySelector('.markdown-preview-view pre code.is-loaded') ??
		document.querySelector('.markdown-preview-view pre code');
	if (previewCode) {
		const el = document.createElement('span');
		if (prismClass) el.className = prismClass;
		el.style.cssText = hidden;
		previewCode.appendChild(el);
		const raw = getComputedStyle(el).color;
		previewCode.removeChild(el);
		const hex = cssColorToHex(raw);
		if (hex) return hex;
	}

	// Strategy 2: editor view with CM compound class
	const scope =
		document.querySelector('.cm-editor .cm-content .cm-line') ??
		document.querySelector('.cm-editor .cm-content') ??
		document.querySelector('.cm-editor');
	if (scope) {
		const el = document.createElement('span');
		el.className = cmClass ? `${cmClass} cm-hmd-codeblock` : 'cm-hmd-codeblock';
		el.style.cssText = hidden;
		scope.appendChild(el);
		const raw = getComputedStyle(el).color;
		scope.removeChild(el);
		const hex = cssColorToHex(raw);
		if (hex) return hex;
	}

	return fallback;
}

/**
 * Reads the inline code text color from the reading view (most accurate)
 * or by injecting a <code> element into .markdown-preview-view.
 */
function readInlineCodeColor(fallback: string): string {
	// Try an actual inline code element first
	const existing = document.querySelector('.markdown-preview-view :not(pre) > code');
	if (existing) {
		const hex = cssColorToHex(getComputedStyle(existing).color);
		if (hex) return hex;
	}
	// Inject a code element into the preview view
	const preview = document.querySelector('.markdown-preview-view');
	if (preview) {
		const p = document.createElement('p');
		const code = document.createElement('code');
		p.style.cssText = 'position: absolute; left: -9999px; pointer-events: none; opacity: 0;';
		p.appendChild(code);
		preview.appendChild(p);
		const hex = cssColorToHex(getComputedStyle(code).color);
		preview.removeChild(p);
		if (hex) return hex;
	}
	return fallback;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Read the live Obsidian theme colors, correctly resolving nested CSS variables. */
export function readObsidianVars(): ObsidianVars {
	const FALLBACK_FONT =
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

	const vars: ObsidianVars = {
		bgPrimary:   readComputedBg('--background-primary',         '#ffffff'),
		bgSecondary: readComputedBg('--background-secondary',       '#f6f8fa'),
		bgBorder:    readComputedColor('--background-modifier-border', '#e5e5e5'),
		textNormal:  readComputedColor('--text-normal',              '#333333'),
		textMuted:   readComputedColor('--text-muted',               '#666666'),
		textFaint:   readComputedColor('--text-faint',               '#999999'),
		accent:      readComputedColor('--interactive-accent',       '#7c3aed'),
		linkColor:   readComputedColor('--link-color',               '#576b95'),
		fontText:    readComputedFont('--font-text',                 FALLBACK_FONT),
		h1Color:     readComputedColor('--h1-color',                 '#1a1a1a'),
		h2Color:     readComputedColor('--h2-color',                 '#1a1a1a'),
		h3Color:     readComputedColor('--h3-color',                 '#1a1a1a'),
		h4Color:     readComputedColor('--h4-color',                 '#1a1a1a'),
		h5Color:     readComputedColor('--h5-color',                 '#1a1a1a'),
		// Code syntax colors: read from CM editor using compound classes.
		// Blue Topaz scopes token colors to e.g. ".cm-builtin.cm-hmd-codeblock"
		// so both classes must be present and the span must be inside .cm-editor.
		// Strategy 1 (reading view): Prism token classes, e.g. "token comment"
		// Strategy 2 (editor view): CM compound class, e.g. "cm-comment cm-hmd-codeblock"
		codeBackground: readComputedBg('--code-background',                    '#f6f8fa'),
		codeNormal:     readCodeTokenColor('',              '',                 '#24292f'),
		codeComment:    readCodeTokenColor('token comment', 'cm-comment',      '#6e7781'),
		codeKeyword:    readCodeTokenColor('token keyword', 'cm-keyword',      '#cf222e'),
		codeFunction:   readCodeTokenColor('token builtin', 'cm-builtin',      '#8250df'),
		codeString:     readCodeTokenColor('token string',  'cm-string',       '#0a3069'),
		codeValue:      readCodeTokenColor('token number',  'cm-number',       '#0550ae'),
		codeTag:        readCodeTokenColor('token tag',     'cm-tag',          '#116329'),
		codeProperty:   readCodeTokenColor('token attr-name',          'cm-property', '#953800'),
		codeVariable:   readCodeTokenColor('token parameter variable', 'cm-variable', '#b45309'),
		codeInline:     readInlineCodeColor('#c7254e'),
		// Callout accent colors from Obsidian's --callout-color per type
		calloutNote:    readCalloutAccent('note',     '#448aff'),
		calloutInfo:    readCalloutAccent('info',     '#2196f3'),
		calloutTip:     readCalloutAccent('tip',      '#00c853'),
		calloutWarning: readCalloutAccent('warning',  '#ff9800'),
		calloutDanger:  readCalloutAccent('danger',   '#f44336'),
		calloutSuccess: readCalloutAccent('success',  '#00c853'),
		calloutExample: readCalloutAccent('example',  '#9c27b0'),
		calloutQuote:   readCalloutAccent('quote',    '#607d8b'),
		calloutAbstract:readCalloutAccent('abstract', '#00bcd4'),
		calloutBlend:   readCalloutBlendFactor(),
	};
	logger.debug('readObsidianVars →', JSON.stringify(vars));
	return vars;
}

// ── StyleEngine ─────────────────────────────────────────────────────────────

export class StyleEngine {
	constructor(private theme: ThemeName = 'light') {}

	setTheme(theme: ThemeName): void {
		this.theme = theme;
	}

	getWrapperStyle(vars?: ObsidianVars): string {
		const FALLBACK_FONT =
			"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
		// Sanitize font: replace any double-quotes with single-quotes so the value
		// can be safely embedded inside style="..." without breaking the attribute.
		const font = (vars?.fontText ?? FALLBACK_FONT).replace(/"/g, "'");
		const base =
			`max-width: 100%; font-family: ${font}; ` +
			`font-size: 16px; line-height: 1.75; letter-spacing: 0.3px; word-break: break-word;`;

		if (this.theme === 'minimal') return base + ' color: #222222; background-color: #ffffff;';
		if (this.theme === 'obsidian' && vars) {
			return base + ` color: ${vars.textNormal}; background-color: ${vars.bgPrimary};`;
		}
		return base + ' color: #333333; background-color: #ffffff;';
	}

	/** Full pipeline: theme overrides → WeChat sanitize → wrapper div. */
	process(html: string, vars?: ObsidianVars): string {
		logger.debug('StyleEngine.process: theme =', this.theme);
		let result = this.applyTheme(html, vars);
		result = sanitizeForWeChat(result);
		const wrapperStyle = this.getWrapperStyle(vars);
		logger.debug('StyleEngine: wrapperStyle =', wrapperStyle);
		logger.debug('StyleEngine: first 300 chars of result =', result.slice(0, 300));
		return `<div style="${wrapperStyle}">${result}</div>`;
	}

	// ── Theme overrides ───────────────────────────────────────────────────────

	private applyTheme(html: string, vars?: ObsidianVars): string {
		if (this.theme === 'minimal') return this.applyMap(html, MINIMAL_MAP);
		if (this.theme === 'obsidian' && vars) return this.applyObsidianOverrides(html, vars);
		return html;
	}

	private applyObsidianOverrides(html: string, v: ObsidianVars): string {
		// Derive a secondary background (for code blocks / table headers).
		const codeBg = v.bgSecondary !== v.bgPrimary
			? v.bgSecondary
			: adjustBrightness(v.bgPrimary, -12);

		// Callout backgrounds: blend bgPrimary with theme-read callout accent color
		// using the theme's own --callout-blend-factor (typically 0.1).
		const f = v.calloutBlend;
		const calloutBg = {
			note:    mixColors(v.bgPrimary, v.calloutNote,    f),
			info:    mixColors(v.bgPrimary, v.calloutInfo,    f),
			tip:     mixColors(v.bgPrimary, v.calloutTip,     f),
			warning: mixColors(v.bgPrimary, v.calloutWarning, f),
			danger:  mixColors(v.bgPrimary, v.calloutDanger,  f),
			success: mixColors(v.bgPrimary, v.calloutSuccess, f),
			example: mixColors(v.bgPrimary, v.calloutExample, f),
			quote:   mixColors(v.bgPrimary, v.calloutQuote,   f),
			abstract:mixColors(v.bgPrimary, v.calloutAbstract,f),
		};

		const map: [RegExp, string][] = [
			// ── Callout backgrounds (replace hardcoded light-theme colors) ─────
			[/background-color: #e8f0fe/g,  `background-color: ${calloutBg.note}`],
			[/background-color: #e8f5e9/g,  `background-color: ${calloutBg.tip}`],     // tip/success share color
			[/background-color: #fff8e1/g,  `background-color: ${calloutBg.warning}`], // warning/todo/question
			[/background-color: #ffebee/g,  `background-color: ${calloutBg.danger}`],  // danger/error/failure
			[/background-color: #e3f2fd/g,  `background-color: ${calloutBg.info}`],
			[/background-color: #f3e5f5/g,  `background-color: ${calloutBg.example}`],
			[/background-color: #f5f5f5/g,  `background-color: ${calloutBg.quote}`],
			[/background-color: #e0f7fa/g,  `background-color: ${calloutBg.abstract}`],
			// ── Callout title text colors (matched via unique trailing "; line-height") ─
			[/color: #448aff; line-height/g, `color: ${v.calloutNote}; line-height`],
			[/color: #2196f3; line-height/g, `color: ${v.calloutInfo}; line-height`],
			[/color: #00c853; line-height/g, `color: ${v.calloutTip}; line-height`],
			[/color: #ff9800; line-height/g, `color: ${v.calloutWarning}; line-height`],
			[/color: #f44336; line-height/g, `color: ${v.calloutDanger}; line-height`],
			[/color: #9c27b0; line-height/g, `color: ${v.calloutExample}; line-height`],
			[/color: #607d8b; line-height/g, `color: ${v.calloutQuote}; line-height`],
			[/color: #00bcd4; line-height/g, `color: ${v.calloutAbstract}; line-height`],
			// ── Headings: per-level color + remove decorative borders ──────────
			// Match font-size+color uniquely per heading level (before generic replacement).
			[/font-size: 24px; color: #1a1a1a/g, `font-size: 24px; color: ${v.h1Color}`],
			[/font-size: 20px; color: #1a1a1a/g, `font-size: 20px; color: ${v.h2Color}`],
			[/font-size: 18px; color: #1a1a1a/g, `font-size: 18px; color: ${v.h3Color}`],
			[/font-size: 16px; color: #1a1a1a/g, `font-size: 16px; color: ${v.h4Color}`],
			[/font-size: 15px; color: #1a1a1a/g, `font-size: 15px; color: ${v.h5Color}`],
			// Remove heading decorative underlines — most themes style headings
			// via color alone; the hardcoded borders look wrong in custom themes.
			[/; border-bottom: 2px solid #7c3aed; padding-bottom: 0\.3em/g, ''],
			[/; border-bottom: 1px solid #e5e5e5; padding-bottom: 0\.2em/g, ''],
			// ── Text ───────────────────────────────────────────────────────────
			[/color: #1a1a1a/g,                   `color: ${v.textNormal}`],  // catch-all
			[/color: #333333/g,                   `color: ${v.textNormal}`],
			[/color: #333(?![0-9a-f])/gi,         `color: ${v.textNormal}`],
			[/color: #444(?![0-9a-f])/gi,         `color: ${v.textNormal}`],
			[/color: #555(?![0-9a-f])/gi,         `color: ${v.textMuted}`],
			[/color: #666(?![0-9a-f])/gi,         `color: ${v.textMuted}`],
			[/color: #999(?![0-9a-f])/gi,         `color: ${v.textFaint}`],
			// ── Accent ─────────────────────────────────────────────────────────
			[/color: #7c3aed/g,                   `color: ${v.accent}`],
			[/border-left: 4px solid #7c3aed/g,   `border-left: 4px solid ${v.accent}`],
			[/background-color: #f9f5ff/g,        `background-color: ${adjustBrightness(v.bgPrimary, -8)}`],
			// ── Links ──────────────────────────────────────────────────────────
			[/color: #576b95/g,                   `color: ${v.linkColor}`],
			// ── Code block background ──────────────────────────────────────────
			[/background-color: #f6f8fa/g,        `background-color: ${v.codeBackground}`],
			[/background-color: #f0f0f0/g,        `background-color: ${v.codeBackground}`],
			[/background-color: #f2f2f2/g,        `background-color: ${v.codeBackground}`],
			// ── Code syntax token colors (HLJS GitHub light → Obsidian theme) ─
			[/color: #24292f/g,                   `color: ${v.codeNormal}`],
			[/color: #6e7781/g,                   `color: ${v.codeComment}`],
			[/color: #cf222e/g,                   `color: ${v.codeKeyword}`],
			[/color: #8250df/g,                   `color: ${v.codeFunction}`],
			[/color: #0a3069/g,                   `color: ${v.codeString}`],
			[/color: #0550ae/g,                   `color: ${v.codeValue}`],
			[/color: #116329/g,                   `color: ${v.codeTag}`],
			[/color: #953800/g,                   `color: ${v.codeProperty}`],
			[/color: #b45309/g,                   `color: ${v.codeVariable}`],
			// ── Inline code ────────────────────────────────────────────────────
			[/color: #c7254e/g,                   `color: ${v.codeInline}`],
			// ── Main background ────────────────────────────────────────────────
			[/background-color: #ffffff/g,        `background-color: ${v.bgPrimary}`],
			// ── Borders (negative lookahead prevents re-matching 6-char hex) ──
			[/border: 1px solid #e1e4e8/g,                    `border: 1px solid ${v.bgBorder}`],
			[/border: 1px solid #ddd(?![0-9a-f])/gi,          `border: 1px solid ${v.bgBorder}`],
			[/border-top: 1px solid #e5e5e5/g,                `border-top: 1px solid ${v.bgBorder}`],
			[/border-bottom: 1px solid #ddd(?![0-9a-f])/gi,   `border-bottom: 1px solid ${v.bgBorder}`],
		];
		return this.applyMap(html, map);
	}

	private applyMap(html: string, map: [RegExp, string][]): string {
		let result = html;
		for (const [re, repl] of map) result = result.replace(re, repl);
		return result;
	}
}

// ── Static theme maps ───────────────────────────────────────────────────────

const MINIMAL_MAP: [RegExp, string][] = [
	[/color: #7c3aed/g,                   'color: #222222'],
	[/border-bottom: 2px solid #7c3aed/g, 'border-bottom: 2px solid #222222'],
	[/border-left: 4px solid #7c3aed/g,   'border-left: 4px solid #cccccc'],
	[/background-color: #f9f5ff/g,        'background-color: #f8f8f8'],
];

// ── Color utilities ─────────────────────────────────────────────────────────

/** Returns true when the hex color is perceived as dark (luminance < 0.5). */
function isColorDark(hex: string): boolean {
	const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (!m) return false;
	const r = parseInt(m[1] ?? '00', 16) / 255;
	const g = parseInt(m[2] ?? '00', 16) / 255;
	const b = parseInt(m[3] ?? '00', 16) / 255;
	return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

/** Mixes two hex colors: fraction=0 → full hex1, fraction=1 → full hex2. */
function mixColors(hex1: string, hex2: string, fraction: number): string {
	const m1 = hex1.match(/^#([0-9a-f]{6})$/i);
	const m2 = hex2.match(/^#([0-9a-f]{6})$/i);
	if (!m1 || !m2) return hex1;
	const h1 = m1[1] ?? '000000';
	const h2 = m2[1] ?? '000000';
	const r = Math.round(parseInt(h1.slice(0,2),16)*(1-fraction) + parseInt(h2.slice(0,2),16)*fraction);
	const g = Math.round(parseInt(h1.slice(2,4),16)*(1-fraction) + parseInt(h2.slice(2,4),16)*fraction);
	const b = Math.round(parseInt(h1.slice(4,6),16)*(1-fraction) + parseInt(h2.slice(4,6),16)*fraction);
	return toHex6(String(r), String(g), String(b));
}

/**
 * Lightens (positive delta) or darkens (negative delta) a hex color.
 */
function adjustBrightness(color: string, delta: number): string {
	const hexM = color.match(/^#([0-9a-f]{6})$/i);
	if (hexM) {
		const hex = hexM[1] ?? '000000';
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		const clamp = (n: number) => Math.max(0, Math.min(255, n + delta));
		return toHex6(String(clamp(r)), String(clamp(g)), String(clamp(b)));
	}
	return color;
}

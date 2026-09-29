/**
 * Static publish-theme registry.
 *
 * A "publish theme" is obsidian-publisher's OWN theme for the exported WeChat
 * article — distinct from the Obsidian app theme used for editing. `obsidian`
 * (the default) mirrors whatever Obsidian theme is currently active, read live
 * via CSS variables (see engine.ts `readObsidianVars`). Every other id here is
 * a fully static, hand-designed palette that renders identically regardless of
 * which Obsidian theme is active — picked for readability on WeChat's mobile
 * article view rather than for code-editing use.
 */

import { mixColors, hexToRgbTriplet } from './color-utils';

export type CalloutType =
	| 'note' | 'abstract' | 'info' | 'todo' | 'tip' | 'success'
	| 'question' | 'warning' | 'failure' | 'danger' | 'bug' | 'example' | 'quote';

export interface CodePalette {
	normal: string;
	comment: string;
	keyword: string;
	function: string;
	string: string;
	value: string;
	tag: string;
	property: string;
	variable: string;
	inline: string;
}

export interface StaticTheme {
	id: string;
	label: string;
	bgPrimary: string;
	textNormal: string;
	textMuted: string;
	textFaint: string;
	textItalic: string;
	linkColor: string;
	accent: string;
	/** Per-level heading colors, h1 → h6. */
	headings: [string, string, string, string, string, string];
	highlightBg: string;
	codeBackground: string;
	borderColor: string;
	code: CodePalette;
	calloutAccent: Record<CalloutType, string>;
	/**
	 * Optional "ribbon banner" treatment for one heading level: a filled bar
	 * (theme.accent background, full width, rounded corners) instead of plain
	 * colored text — e.g. 橙心's numbered section headers. Only levels 1–2 are
	 * supported since it's meant for top-level section dividers, not every
	 * heading depth.
	 */
	headingBanner?: { level: 1 | 2; textColor: string; flagColor?: string };
	/** Optional override for **bold** text color; defaults to textNormal (inherited) when unset. */
	boldColor?: string;
}

// Representative type used for each of the 8 visually-distinct callout groups
// the renderer emits (several minor types share a background/title color).
const CALLOUT_GROUPS: CalloutType[] = ['note', 'info', 'tip', 'warning', 'danger', 'example', 'quote', 'abstract'];

// Literal <h1>/<h2> opening tags emitted by markdown/parser.ts — matched
// verbatim (before any other regex touches them) so buildStaticThemeMap can
// swap a heading level's plain colored text for a ribbon-banner treatment:
// an inline-block badge (hugs the text) inside a full-width element whose
// own border-bottom draws the underline that runs past the badge.
const H1_OPEN_SOURCE = /<h1 style="font-size: 24px; color: #1a1a1a; font-weight: 700; line-height: 1\.3; margin: 1\.5em 0 0\.8em 0; border-bottom: 2px solid #7c3aed; padding-bottom: 0\.3em;">/g;
const H2_OPEN_SOURCE = /<h2 style="font-size: 20px; color: #1a1a1a; font-weight: 600; line-height: 1\.3; margin: 1\.3em 0 0\.6em 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 0\.2em;">/g;
const H1_CLOSE_SOURCE = /<\/h1>/g;
const H2_CLOSE_SOURCE = /<\/h2>/g;

// ── 马卡龙紫 (Macaron Purple / Catppuccin Latte, migrated from the old 'light' id) ──
// Soft pastel lavender background with a mauve accent — gentle, friendly, a
// little "cute". Suited to lifestyle, reading-notes, and personal-essay
// accounts rather than formal/technical writing.
// Palette reference: https://catppuccin.com/palette (Latte flavour)

const CATPPUCCIN_LATTE: StaticTheme = {
	id: 'catppuccin-latte',
	label: '马卡龙紫',
	bgPrimary: '#EFF1F5',
	textNormal: '#4C4F69',
	textMuted: '#6C6F85',
	textFaint: '#9CA0B0',
	textItalic: '#5C5F77',
	linkColor: '#1E66F5',
	accent: '#8839EF',
	headings: ['#8839EF', '#1E66F5', '#179299', '#40A02B', '#DF8E1D', '#9CA0B0'],
	highlightBg: '#EAD3B4',
	codeBackground: '#CCD0DA',
	borderColor: '#CCD0DA',
	code: {
		normal: '#4C4F69', comment: '#8C8FA1', keyword: '#D20F39', function: '#8839EF',
		string: '#40A02B', value: '#FE640B', tag: '#D20F39', property: '#179299',
		variable: '#E64553', inline: '#D20F39',
	},
	calloutAccent: {
		note: '#1E66F5', abstract: '#179299', info: '#209FB5', todo: '#FE640B',
		tip: '#40A02B', success: '#40A02B', question: '#DF8E1D', warning: '#DF8E1D',
		failure: '#D20F39', danger: '#D20F39', bug: '#E64553', example: '#8839EF', quote: '#9CA0B0',
	},
};

// ── 简约黑白 (Minimal Mono) ──────────────────────────────────────────────
// Grayscale typography hierarchy with a single restrained ink-blue accent.
// Designed for long-form reading where color should not compete with content.

const MINIMAL_MONO: StaticTheme = {
	id: 'minimal-mono',
	label: '简约黑白',
	bgPrimary: '#FAFAF8',
	textNormal: '#1F1F1F',
	textMuted: '#595959',
	textFaint: '#9A9A9A',
	textItalic: '#4A4A4A',
	linkColor: '#2B5FAD',
	accent: '#2B5FAD',
	headings: ['#14213D', '#1F1F1F', '#333333', '#404040', '#4D4D4D', '#595959'],
	highlightBg: '#F5E6A8',
	codeBackground: '#F1F1EE',
	borderColor: '#E2E2DE',
	code: {
		normal: '#3760bf', comment: '#848cb8', keyword: '#9854f1', function: '#2e7de9',
		string: '#587539', value: '#b15c00', tag: '#f52a65', property: '#007197',
		variable: '#c64343', inline: '#a23e48',
	},
	calloutAccent: {
		note: '#335FA8', abstract: '#2E7C7C', info: '#3A7D96', todo: '#B26E35',
		tip: '#3F7C47', success: '#3F7C47', question: '#B28C35', warning: '#B28C35',
		failure: '#B23F3F', danger: '#B23F3F', bug: '#964242', example: '#6C5CA0', quote: '#828282',
	},
};

// ── 护眼杏仁 (Warm Almond) ───────────────────────────────────────────────
// Warm cream background with soft brown text — reduces eye strain on long
// articles. Code palette echoes Gruvbox Light's warm/earthy tone family.

const WARM_ALMOND: StaticTheme = {
	id: 'warm-almond',
	label: '护眼杏仁',
	bgPrimary: '#F7F1E1',
	textNormal: '#4A3B2A',
	textMuted: '#7A6A52',
	textFaint: '#A79878',
	textItalic: '#6B5A42',
	linkColor: '#A85C32',
	accent: '#B5652E',
	headings: ['#8C4A22', '#A85C32', '#946B2D', '#7C7A34', '#6E6E3B', '#7A6A52'],
	highlightBg: '#F0DFA0',
	codeBackground: '#EFE4C9',
	borderColor: '#DFCFA8',
	code: {
		normal: '#5A4632', comment: '#A08A6C', keyword: '#9D0006', function: '#AF3A03',
		string: '#79740E', value: '#B57614', tag: '#8F3F71', property: '#427B58',
		variable: '#076678', inline: '#9D0006',
	},
	calloutAccent: {
		note: '#458588', abstract: '#427B58', info: '#458588', todo: '#B57614',
		tip: '#79740E', success: '#79740E', question: '#B57614', warning: '#B57614',
		failure: '#9D0006', danger: '#9D0006', bug: '#AF3A03', example: '#8F3F71', quote: '#A08A6C',
	},
};

// ── 科技蓝 (Tech Blue) ───────────────────────────────────────────────────
// Cool light gray-blue background, indigo accents. Crisp and professional —
// suited to tech/business/finance accounts.

const TECH_BLUE: StaticTheme = {
	id: 'tech-blue',
	label: '科技蓝',
	bgPrimary: '#F4F7FB',
	textNormal: '#1B2733',
	textMuted: '#526070',
	textFaint: '#8A97A6',
	textItalic: '#3E4C5B',
	linkColor: '#1B5FAE',
	accent: '#1B5FAE',
	headings: ['#0B3D91', '#1B5FAE', '#2472C8', '#1F6F6F', '#455A75', '#526070'],
	highlightBg: '#CDEBFA',
	codeBackground: '#E7EEF6',
	borderColor: '#D3DEE9',
	code: {
		normal: '#1B2733', comment: '#8A97A6', keyword: '#A626A4', function: '#1B5FAE',
		string: '#0B7285', value: '#B0651A', tag: '#C0356C', property: '#2472C8',
		variable: '#5B6EC7', inline: '#B0365B',
	},
	calloutAccent: {
		note: '#1B5FAE', abstract: '#1F6F6F', info: '#2472C8', todo: '#B0651A',
		tip: '#2E8B57', success: '#2E8B57', question: '#C08A1A', warning: '#C08A1A',
		failure: '#C0356C', danger: '#C0356C', bug: '#A83A3A', example: '#5B4EA6', quote: '#7C8CA0',
	},
};

// ── 中国红 (China Red) ───────────────────────────────────────────────────
// Warm ivory background with vermillion + gold accents. Suited to
// culture/history/commentary accounts.

const CHINA_RED: StaticTheme = {
	id: 'china-red',
	label: '中国红',
	bgPrimary: '#FBF3E6',
	textNormal: '#2E2420',
	textMuted: '#6B5A4E',
	textFaint: '#A6907E',
	textItalic: '#5A4436',
	linkColor: '#8B5E1F',
	accent: '#C0392B',
	headings: ['#9B1B1B', '#C0392B', '#B5651D', '#8B5E1F', '#6E5433', '#6B5A4E'],
	highlightBg: '#F5DDA0',
	codeBackground: '#F3E6CE',
	borderColor: '#E3CFAE',
	code: {
		normal: '#3B2E22', comment: '#9C8468', keyword: '#9B1B1B', function: '#B5651D',
		string: '#5F7A3D', value: '#8B5E1F', tag: '#C0392B', property: '#6E7A3D',
		variable: '#8F3F3F', inline: '#9B1B1B',
	},
	calloutAccent: {
		note: '#B5651D', abstract: '#6E7A3D', info: '#8B5E1F', todo: '#B5651D',
		tip: '#5F7A3D', success: '#5F7A3D', question: '#C08A2A', warning: '#C08A2A',
		failure: '#9B1B1B', danger: '#9B1B1B', bug: '#7A2E2E', example: '#8F3F6E', quote: '#9C8468',
	},
};

// ── 森系绿 (Forest Green) ────────────────────────────────────────────────
// Fresh sage-white background, emerald accent (nodding to 墨滴's 翡翠绿).
// Suited to health, education, and personal-growth accounts.

const FOREST_GREEN: StaticTheme = {
	id: 'forest-green',
	label: '森系绿',
	bgPrimary: '#F3F7F2',
	textNormal: '#223327',
	textMuted: '#5B7360',
	textFaint: '#94A896',
	textItalic: '#3E5A44',
	linkColor: '#1E7A4C',
	accent: '#009874',
	headings: ['#1B5E3A', '#009874', '#1B8067', '#566B2F', '#6B8A4E', '#7C8F7E'],
	highlightBg: '#DCEFC2',
	codeBackground: '#E6EFE1',
	borderColor: '#D3E0D0',
	code: {
		normal: '#2A3B2E', comment: '#7C8F7E', keyword: '#1B5E3A', function: '#1E7A4C',
		string: '#6B8A4E', value: '#B08A3E', tag: '#C0533E', property: '#2F8F72',
		variable: '#8A6B3E', inline: '#1B5E3A',
	},
	calloutAccent: {
		note: '#1E7A4C', abstract: '#2F8F72', info: '#3B7A8F', todo: '#B08A3E',
		tip: '#6B8A4E', success: '#1B8067', question: '#B08A3E', warning: '#B08A3E',
		failure: '#B0473E', danger: '#B0473E', bug: '#8F4A3E', example: '#6B5B8A', quote: '#8CA08E',
	},
};

// ── 樱语粉 (Sakura Pink) ─────────────────────────────────────────────────
// Soft blush background, sakura-pink accent (nodding to 墨滴's 樱花粉/玫瑰金).
// Suited to lifestyle, personal, and emotional-writing accounts.

const SAKURA_PINK: StaticTheme = {
	id: 'sakura-pink',
	label: '樱语粉',
	bgPrimary: '#FDF4F5',
	textNormal: '#4A2E33',
	textMuted: '#8A6067',
	textFaint: '#C79BA1',
	textItalic: '#6B454B',
	linkColor: '#B76E79',
	accent: '#E0708A',
	headings: ['#C2456A', '#E0708A', '#B76E79', '#A66B8F', '#C98A5E', '#8A6067'],
	highlightBg: '#FBDCE3',
	codeBackground: '#F5E3E6',
	borderColor: '#EAD0D5',
	code: {
		normal: '#4A2E33', comment: '#A98790', keyword: '#C2456A', function: '#B76E79',
		string: '#7A8A5E', value: '#C98A5E', tag: '#C2456A', property: '#8F6B8A',
		variable: '#A6503E', inline: '#C2456A',
	},
	calloutAccent: {
		note: '#B76E79', abstract: '#A66B8F', info: '#8F7BA6', todo: '#C98A5E',
		tip: '#7A8A5E', success: '#7A8A5E', question: '#C98A5E', warning: '#C98A5E',
		failure: '#C2456A', danger: '#C2456A', bug: '#A6503E', example: '#8F7BA6', quote: '#B79AA1',
	},
};

// ── 深空灰 (Graphite Dark) ───────────────────────────────────────────────
// The first dark preset: deep charcoal background, warm amber accent (a nod
// to 墨滴's 石墨黑, reimagined as a full dark theme rather than just an accent).
// Suited to tech/digital-review accounts and night-time reading.

const GRAPHITE_DARK: StaticTheme = {
	id: 'graphite-dark',
	label: '深空灰',
	bgPrimary: '#1E2124',
	textNormal: '#E4E6EB',
	textMuted: '#A0A4AC',
	textFaint: '#6B6F76',
	textItalic: '#C4C8CE',
	linkColor: '#6FA8DC',
	accent: '#E0A458',
	headings: ['#E0A458', '#6FA8DC', '#7FC8A9', '#D88C9A', '#B39DDB', '#A0A4AC'],
	highlightBg: '#4A3F2A',
	codeBackground: '#2A2D31',
	borderColor: '#3A3E44',
	code: {
		normal: '#E4E6EB', comment: '#6B6F76', keyword: '#C792EA', function: '#82AAFF',
		string: '#C3E88D', value: '#F78C6C', tag: '#FF5370', property: '#7FC8A9',
		variable: '#FFCB6B', inline: '#FF5370',
	},
	calloutAccent: {
		note: '#6FA8DC', abstract: '#7FC8A9', info: '#82AAFF', todo: '#F78C6C',
		tip: '#C3E88D', success: '#C3E88D', question: '#FFCB6B', warning: '#FFCB6B',
		failure: '#FF5370', danger: '#FF5370', bug: '#E0708A', example: '#C792EA', quote: '#8A8F98',
	},
};

// ── 橙心 (Orange Heart) ──────────────────────────────────────────────────
// Modeled on the classic "橙心" WeChat-markdown skin: near-white background,
// coral-orange primary with a jade-teal secondary for contrast. The
// reference design bands section headings in an orange ribbon with a
// triangular flag notch — a structural (background-shape) effect our
// color-substitution architecture doesn't replicate, so this version carries
// the same warm orange/teal identity through colored heading text instead.
// Suited to tech/knowledge-sharing blogs and general long-form writing.

const ORANGE_HEART: StaticTheme = {
	id: 'orange-heart',
	label: '橙心',
	bgPrimary: '#FFFFFF',
	textNormal: '#262626',
	textMuted: '#5C5C5C',
	textFaint: '#9B9B9B',
	textItalic: '#6B6B6B',
	linkColor: '#DF7766',
	accent: '#DF7766',
	headings: ['#C85A3A', '#DF7766', '#3F9C8B', '#E08860', '#4FAD9C', '#9B9B9B'],
	highlightBg: '#FDE8DC',
	codeBackground: '#F5F1EC',
	borderColor: '#EDE6DE',
	code: {
		normal: '#3A342E', comment: '#A69C90', keyword: '#C85A3A', function: '#3F9C8B',
		string: '#6B8A4E', value: '#DF7766', tag: '#C85A3A', property: '#3F9C8B',
		variable: '#B0793E', inline: '#3F9C8B',
	},
	calloutAccent: {
		note: '#DF7766', abstract: '#3F9C8B', info: '#4FAD9C', todo: '#E0954A',
		tip: '#6B8A4E', success: '#6B8A4E', question: '#E0954A', warning: '#E0954A',
		failure: '#C85A3A', danger: '#C85A3A', bug: '#A6503E', example: '#8F6B8A', quote: '#A69C90',
	},
	headingBanner: { level: 2, textColor: '#FFFFFF', flagColor: '#EEEBE9' },
	boldColor: '#3F9C8B',
};

export const STATIC_THEMES: Record<string, StaticTheme> = {
	'catppuccin-latte': CATPPUCCIN_LATTE,
	'minimal-mono': MINIMAL_MONO,
	'warm-almond': WARM_ALMOND,
	'tech-blue': TECH_BLUE,
	'china-red': CHINA_RED,
	'forest-green': FOREST_GREEN,
	'sakura-pink': SAKURA_PINK,
	'graphite-dark': GRAPHITE_DARK,
	'orange-heart': ORANGE_HEART,
};

/** Ordered list for building settings dropdowns. */
export const STATIC_THEME_LIST: StaticTheme[] = [
	CATPPUCCIN_LATTE, MINIMAL_MONO, WARM_ALMOND, TECH_BLUE, CHINA_RED,
	FOREST_GREEN, SAKURA_PINK, GRAPHITE_DARK, ORANGE_HEART,
];

/** id/label pairs for building a theme <select>, 'obsidian' first — shared by
 *  the settings tab and the preview modal/panel theme switchers. */
export const THEME_OPTIONS: { id: string; label: string }[] = [
	{ id: 'obsidian', label: '当前 Obsidian 主题' },
	...STATIC_THEME_LIST.map(t => ({ id: t.id, label: t.label })),
];

/** 'obsidian' (live theme) or any key of STATIC_THEMES. Kept as `string` since
 *  settings persist arbitrary saved values (including legacy ids). */
export type ThemeName = string;

/** Old saved setting id from before the theme registry existed. */
export const LEGACY_THEME_ALIASES: Record<string, string> = {
	light: 'catppuccin-latte',
};

export function resolveThemeId(id: string): string {
	return LEGACY_THEME_ALIASES[id] ?? id;
}

export function getStaticTheme(themeId: string): StaticTheme | undefined {
	return STATIC_THEMES[resolveThemeId(themeId)];
}

/** Background for a callout type: theme base blended ~10% with the type's accent. */
function calloutBg(theme: StaticTheme, type: CalloutType): string {
	return mixColors(theme.bgPrimary, theme.calloutAccent[type], 0.1);
}

/**
 * Builds the full inline-style replacement map for a static theme, mirroring
 * the fixed set of hardcoded colors emitted by markdown/parser.ts.
 */
export function buildStaticThemeMap(theme: StaticTheme): [RegExp, string][] {
	const bgSourcePattern: Record<string, RegExp> = {
		note: /background-color: #e8f0fe/g,
		info: /background-color: #e3f2fd/g,
		tip: /background-color: #e8f5e9/g,
		warning: /background-color: #fff8e1/g,
		danger: /background-color: #ffebee/g,
		example: /background-color: #f3e5f5/g,
		quote: /background-color: #f5f5f5/g,
		abstract: /background-color: #e0f7fa/g,
	};
	const titleSourcePattern: Record<string, RegExp> = {
		note: /color: #448aff; line-height/g,
		info: /color: #2196f3; line-height/g,
		tip: /color: #00c853; line-height/g,
		warning: /color: #ff9800; line-height/g,
		danger: /color: #f44336; line-height/g,
		example: /color: #9c27b0; line-height/g,
		quote: /color: #607d8b; line-height/g,
		abstract: /color: #00bcd4; line-height/g,
	};

	const map: [RegExp, string][] = [];
	if (theme.headingBanner) {
		const { level, textColor, flagColor } = theme.headingBanner;
		const fontSize = level === 1 ? '22px' : '18px';
		const margin = level === 1 ? '1.5em 0 0.8em 0' : '1.3em 0 0.6em 0';
		// Badge height = padding(6+6) + line-height(1.4 × font-size), rounded up.
		// The flag triangle below is a fixed-size border shape (WeChat's paste
		// sanitizer strips clip-path, so it can't use flex stretch to match the
		// badge automatically) — keep this in sync with padding/font-size above.
		const badgeHeight = level === 1 ? 43 : 37;
		// Rounded only on the top-left: the right edge butts against the flag
		// (when present), and the bottom stays square so the full-width
		// underline meets it cleanly instead of poking out past a curve.
		const badgeStyle =
			`display: inline-block; background-color: ${theme.accent}; color: ${textColor}; ` +
			`font-size: ${fontSize}; font-weight: 700; line-height: 1.4; padding: 6px 18px; border-radius: 6px 0 0 0;`;
		const wrapperStyle =
			`display: flex; align-items: stretch; margin: ${margin}; ` +
			`border-bottom: 2px solid ${theme.accent};`;
		// A border-only triangle (not clip-path) so it survives WeChat's paste
		// sanitizer: border-bottom draws the diagonal, border-right is the
		// transparent run-up that gives it width — left edge (against the
		// badge) stays straight/vertical. margin-left is the gap to the badge.
		const flagHtml = flagColor
			? `<span style="display: inline-block; width: 0; height: 0; margin-left: 6px; ` +
			  `border-style: solid; border-width: 0 20px ${badgeHeight}px 0; ` +
			  `border-color: transparent transparent ${flagColor} transparent;"></span>`
			: '';
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		map.push(
			[openSource, `<${tag} style="${wrapperStyle}"><span style="${badgeStyle}">`],
			[closeSource, `</span>${flagHtml}</${tag}>`],
		);
	}
	if (theme.boldColor) {
		// Lookbehind restricts this to <strong>'s own color: #1a1a1a, so the
		// generic text catch-all below still governs everywhere else.
		map.push([/(?<=<strong[^>]*?)color: #1a1a1a/g, `color: ${theme.boldColor}`]);
	}
	for (const type of CALLOUT_GROUPS) {
		map.push([bgSourcePattern[type]!, `background-color: ${calloutBg(theme, type)}`]);
	}
	for (const type of CALLOUT_GROUPS) {
		map.push([titleSourcePattern[type]!, `color: ${theme.calloutAccent[type]}; line-height`]);
	}

	map.push(
		// ── Headings: per-level color (must run before catch-all #1a1a1a) ────
		[/font-size: 24px; color: #1a1a1a/g, `font-size: 24px; color: ${theme.headings[0]}`],
		[/font-size: 20px; color: #1a1a1a/g, `font-size: 20px; color: ${theme.headings[1]}`],
		[/font-size: 18px; color: #1a1a1a/g, `font-size: 18px; color: ${theme.headings[2]}`],
		[/font-size: 16px; color: #1a1a1a/g, `font-size: 16px; color: ${theme.headings[3]}`],
		[/font-size: 15px; color: #1a1a1a/g, `font-size: 15px; color: ${theme.headings[4]}`],
		[/font-size: 14px; color: #1a1a1a/g, `font-size: 14px; color: ${theme.headings[5]}`],
		// ── Highlighted text ───────────────────────────────────────────────
		[/background-color: #fff3b1/g, `background-color: ${theme.highlightBg}`],
		// ── Italic ──────────────────────────────────────────────────────────
		[/color: #4a5568/g, `color: ${theme.textItalic}`],
		// ── Text (catch-all — runs after per-level heading replacements) ────
		[/color: #1a1a1a/g, `color: ${theme.textNormal}`],
		[/color: #333333/g, `color: ${theme.textNormal}`],
		[/color: #333(?![0-9a-f])/gi, `color: ${theme.textNormal}`],
		[/color: #444(?![0-9a-f])/gi, `color: ${theme.textNormal}`],
		[/color: #555(?![0-9a-f])/gi, `color: ${theme.textMuted}`],
		[/color: #666(?![0-9a-f])/gi, `color: ${theme.textMuted}`],
		[/color: #999(?![0-9a-f])/gi, `color: ${theme.textFaint}`],
		// ── Accent ──────────────────────────────────────────────────────────
		[/color: #7c3aed/g, `color: ${theme.accent}`],
		[/background-color: #7c3aed/g, `background-color: ${theme.accent}`],
		[/border-left: 2px solid #7c3aed/g, `border-left: 2px solid ${theme.accent}`],
		[/border-bottom: 2px solid #7c3aed/g, `border-bottom: 2px solid ${theme.accent}`],
		// ── Links ───────────────────────────────────────────────────────────
		[/color: #576b95/g, `color: ${theme.linkColor}`],
		// ── Code block background ──────────────────────────────────────────
		[/background-color: #f6f8fa/g, `background-color: ${theme.codeBackground}`],
		[/background-color: #f0f0f0/g, `background-color: ${theme.codeBackground}`],
		// ── Table header background + text color ────────────────────────────
		[/background-color: #f2f2f2/g, `background-color: ${theme.codeBackground}`],
		[/color: #2d3748/g, `color: ${theme.accent}`],
		// ── Code syntax tokens (HLJS GitHub Light → theme palette) ─────────
		[/color: #24292f/g, `color: ${theme.code.normal}`],
		[/color: #6e7781/g, `color: ${theme.code.comment}`],
		[/color: #cf222e/g, `color: ${theme.code.keyword}`],
		[/color: #8250df/g, `color: ${theme.code.function}`],
		[/color: #0a3069/g, `color: ${theme.code.string}`],
		[/color: #0550ae/g, `color: ${theme.code.value}`],
		[/color: #116329/g, `color: ${theme.code.tag}`],
		[/color: #953800/g, `color: ${theme.code.property}`],
		[/color: #b45309/g, `color: ${theme.code.variable}`],
		// ── Inline code ─────────────────────────────────────────────────────
		[/color: #c7254e/g, `color: ${theme.code.inline}`],
		// ── Main background ─────────────────────────────────────────────────
		[/background-color: #ffffff/g, `background-color: ${theme.bgPrimary}`],
		// ── Borders ──────────────────────────────────────────────────────────
		[/border: 1px solid #e1e4e8/g, `border: 1px solid ${theme.borderColor}`],
		[/border: 1px solid #ddd(?![0-9a-f])/gi, `border: 1px solid ${theme.borderColor}`],
		[/border-top: 1px solid #e5e5e5/g, `border-top: 1px solid ${theme.borderColor}`],
		[/border-bottom: 1px solid #ddd(?![0-9a-f])/gi, `border-bottom: 1px solid ${theme.borderColor}`],
	);
	return map;
}

/** Per-callout-type "r, g, b" map used by markdown/plugins/callout.ts. */
export function buildCalloutRgbMap(theme: StaticTheme): Record<CalloutType, string> {
	const out = {} as Record<CalloutType, string>;
	for (const type of Object.keys(theme.calloutAccent) as CalloutType[]) {
		out[type] = hexToRgbTriplet(theme.calloutAccent[type]);
	}
	return out;
}

/** Builds a Mermaid %%{init}%% directive that recolors diagrams to match a static theme. */
export function buildMermaidInit(theme: StaticTheme): string {
	const primary = mixColors(theme.bgPrimary, theme.calloutAccent.note, 0.25);
	const secondary = mixColors(theme.bgPrimary, theme.calloutAccent.tip, 0.25);
	const tertiary = mixColors(theme.bgPrimary, theme.accent, 0.25);
	const clusterBg = mixColors(theme.bgPrimary, theme.textFaint, 0.15);
	const pie = [
		theme.calloutAccent.note, theme.calloutAccent.todo, theme.calloutAccent.warning,
		theme.calloutAccent.tip, theme.accent, theme.calloutAccent.abstract, theme.calloutAccent.danger,
	];
	return (
		'%%{init: {"theme":"base","themeVariables":{' +
		`"background":"${theme.bgPrimary}",` +
		`"primaryColor":"${primary}","primaryBorderColor":"${theme.calloutAccent.note}","primaryTextColor":"${theme.textNormal}",` +
		`"secondaryColor":"${secondary}","secondaryBorderColor":"${theme.calloutAccent.tip}","secondaryTextColor":"${theme.textNormal}",` +
		`"tertiaryColor":"${tertiary}","tertiaryBorderColor":"${theme.accent}","tertiaryTextColor":"${theme.textNormal}",` +
		`"lineColor":"${theme.textFaint}","edgeLabelBackground":"${theme.bgPrimary}",` +
		`"clusterBkg":"${clusterBg}","clusterBorder":"${theme.textFaint}",` +
		`"nodeTextColor":"${theme.textNormal}","titleColor":"${theme.textNormal}",` +
		`"pie1":"${pie[0]}","pie2":"${pie[1]}","pie3":"${pie[2]}","pie4":"${pie[3]}",` +
		`"pie5":"${pie[4]}","pie6":"${pie[5]}","pie7":"${pie[6]}",` +
		'"fontFamily":"sans-serif"},"flowchart":{"htmlLabels":false}}}%%\n'
	);
}

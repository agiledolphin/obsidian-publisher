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
	/**
	 * Optional "ticket/stamp" treatment for one heading level: a full-width
	 * rule above a bordered, inset box with centered text and small corner
	 * crosses — e.g. 简约黑白's H2. Only levels 1–2 are supported, same
	 * reasoning as headingBanner.
	 */
	headingBox?: { level: 1 | 2; borderColor: string; quoteMarks?: boolean };
	/**
	 * Optional "solid bar" treatment for one heading level: the heading tag
	 * itself (no extra wrapper element — just restyled in place) gets a solid
	 * background-color, contrasting text color, and left-aligned padding,
	 * instead of plain colored text. Simpler and lower-risk than headingBanner/
	 * headingBox (a single existing element restyled vs. several new ones),
	 * since a block tag with real text content and a plain background-color
	 * is the single most reliably-surviving pattern confirmed this session.
	 */
	headingBar?: { level: 1 | 2; bgColor: string; textColor: string };
	/**
	 * Optional small icon + soft-highlighted text treatment for one heading
	 * level — an <img> (single combined SVG, not several separately-
	 * positioned shapes) followed by the heading text on a subtle tinted
	 * background, laid out with plain `display:flex; align-items:center`
	 * (no stretch-matching, no precise height dependency between the two —
	 * flex centering a small fixed-size icon against natural-height text is
	 * low-risk, unlike the badge/flag height-matching problems elsewhere in
	 * this file). `iconSvg` is the inner markup only (paths/shapes), wrapped
	 * in a standard `<svg viewBox="0 0 24 24">` automatically.
	 */
	headingIcon?: { level: 1 | 2; iconSvg: string; textColor: string; textBg: string; barColor?: string };
	/**
	 * Optional "hanging tab" treatment for one heading level: a full-width
	 * rule (the heading's own border-top) with a solid tab centered right
	 * under it — square top corners against the rule, rounded bottom ones.
	 * Two elements, both carrying real text: the heading and an inline-block
	 * <span>. Nothing has to match another element's height.
	 */
	headingTab?: { level: 1 | 2; color: string; textColor: string };
	/**
	 * Optional gradient-text treatment for one heading level: real, selectable
	 * text painted with a top-to-bottom gradient (background-clip: text) that
	 * fades out toward the bottom. `stops` are the top, middle (55%) and
	 * bottom colors; `color` is the plain text color underneath. Confirmed to
	 * survive a WeChat paste — linear-gradient backgrounds are kept (unlike
	 * url() background images).
	 */
	headingGradient?: { level: 1 | 2; stops: [string, string, string]; color: string };
	/**
	 * Heading levels that should drop the default underline (an accent-colored
	 * border-bottom, normally applied to H1/H2 automatically) entirely, with
	 * no replacement decoration — for themes where a level already gets its
	 * own treatment from headingBanner/headingBox, or simply shouldn't be
	 * underlined at all.
	 */
	noUnderline?: (1 | 2)[];
	/** Optional override for **bold** text color; defaults to textNormal (inherited) when unset. */
	boldColor?: string;
	/**
	 * Optional override for table-header text color; defaults to `accent`.
	 * Needed when the accent is too light to read as 15px text on the
	 * codeBackground header fill (WCAG AA wants ≥ 4.5:1).
	 */
	tableHeaderColor?: string;
	/**
	 * Don't export `bgPrimary` as the article's page background — WeChat's
	 * own page shows through instead. Only for light themes whose text stays
	 * readable on white; `bgPrimary` is still used internally (callout tints,
	 * etc.).
	 */
	transparentPage?: boolean;
	/**
	 * Optional overrides for task-list checkbox fill colors. 'done' isn't
	 * included — it already follows `accent` via the shared #7c3aed
	 * placeholder every theme's accent color flows through. 'todo' isn't
	 * included either — it's an unfilled border, no fill color to override.
	 * Any state left unset keeps parser.ts's hardcoded default color.
	 */
	taskAccent?: Partial<Record<'inProgress' | 'rescheduled' | 'question' | 'important', string>>;
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

// ── 紫雾 (Purple Mist) ───────────────────────────────────────────────────
// Successor to 马卡龙紫 (old ids 'catppuccin-latte' and 'light' resolve here).
// A blue-leaning violet (hue ~250°) with indigo, teal and magenta as
// supporting hues; text colors carry a faint violet tint. The H2 is the
// "mist": violet gradient text fading out toward the bottom. No page
// background; bold stays body-colored; H1 has no underline so the H2 is the
// one decorative flourish. Heading/callout/link colors are ≥4.7:1 on white.

const PURPLE_MIST: StaticTheme = {
	id: 'purple-mist',
	label: '紫雾',
	bgPrimary: '#FFFFFF',
	textNormal: '#2E2A3B',
	textMuted: '#635D75',
	textFaint: '#A29CB4',
	textItalic: '#554F68',
	linkColor: '#4F3BD9',
	accent: '#6D4AFF',
	headings: ['#4B2BC2', '#5B3DF5', '#6A3FD6', '#8A3FB8', '#6B5B95', '#767089'],
	highlightBg: '#EDE7FF',
	codeBackground: '#F6F4FB',
	borderColor: '#E4DFF2',
	code: {
		normal: '#2E2A3B', comment: '#8E88A0', keyword: '#7A3FD0', function: '#3D5BD9',
		string: '#2F7D5B', value: '#B83280', tag: '#7A3FD0', property: '#3D5BD9',
		variable: '#9D3A8C', inline: '#7A3FD0',
	},
	calloutAccent: {
		note: '#5B3DF5', abstract: '#1F7A80', info: '#2F5FD0', todo: '#5B3DF5',
		tip: '#2F7D5B', success: '#2F7D5B', question: '#A0640C', warning: '#A0640C',
		failure: '#C0304F', danger: '#C0304F', bug: '#A3304A', example: '#A3369B', quote: '#767089',
	},
	headingGradient: { level: 2, stops: ['#5B3DF5', '#8F78FF', 'rgba(170, 150, 255, 0.15)'], color: '#6D4AFF' },
	noUnderline: [1],
	taskAccent: { inProgress: '#2F5FD0', rescheduled: '#9D3A8C', question: '#A0640C', important: '#C0304F' },
	transparentPage: true,
};

// ── 简约黑白 (Minimal Mono) ──────────────────────────────────────────────
// Grayscale typography hierarchy with a single restrained ink-blue accent.
// Designed for long-form reading where color should not compete with content.
// Code syntax highlighting and callouts are grayscale too (code: lightness
// alone carries the hierarchy comments/keywords would otherwise get from
// hue; callouts: a 4-tier gray severity ramp — critical/caution/neutral/calm
// — instead of a different hue per type), so nothing breaks the mono promise
// the theme's name makes. Type is still readable without color: each callout
// keeps its own icon shape and label text.

const MINIMAL_MONO: StaticTheme = {
	id: 'minimal-mono',
	label: '简约黑白一',
	bgPrimary: '#FAFAF8',
	textNormal: '#1F1F1F',
	textMuted: '#595959',
	textFaint: '#9A9A9A',
	textItalic: '#4A4A4A',
	linkColor: '#2B5FAD',
	accent: '#2B5FAD',
	headings: ['#14213D', '#1F1F1F', '#333333', '#404040', '#4D4D4D', '#595959'],
	highlightBg: '#DCDCD6',
	codeBackground: '#F1F1EE',
	tableHeaderColor: '#1F1F1F',
	borderColor: '#E2E2DE',
	code: {
		normal: '#262626', comment: '#9A9A9A', keyword: '#1A1A1A', function: '#404040',
		string: '#6B6B6B', value: '#595959', tag: '#333333', property: '#595959',
		variable: '#4D4D4D', inline: '#333333',
	},
	calloutAccent: {
		// Critical: failure/danger/bug — darkest, most visual weight.
		failure: '#1F1F1F', danger: '#1F1F1F', bug: '#1F1F1F',
		// Caution: todo/question/warning — asks for attention, not alarm.
		todo: '#404040', question: '#404040', warning: '#404040',
		// Neutral: note/abstract/info/example — plain informational.
		note: '#595959', abstract: '#595959', info: '#595959', example: '#595959',
		// Calm: tip/success/quote — positive or understated, lightest tier.
		tip: '#808080', success: '#808080', quote: '#808080',
	},
	headingBox: { level: 2, borderColor: '#1F1F1F', quoteMarks: true },
	noUnderline: [1],
	// 'done' already follows accent (ink-blue) via the shared placeholder;
	// 'cancelled' is already a neutral gray by default. These four are the
	// ones that were still full-hue (blue/orange/yellow/red) regardless of
	// theme — graded by the same severity logic as calloutAccent above.
	taskAccent: { inProgress: '#404040', rescheduled: '#595959', question: '#595959', important: '#1F1F1F' },
};

// ── 简约黑白二 (Minimal Mono II) ─────────────────────────────────────────
// Identical palette to 简约黑白一 (same grayscale code/callout/task-list
// treatment) — only the H2 decoration differs: a solid black bar with
// left-aligned white text instead of a bordered box with corner marks.

const MINIMAL_MONO_2: StaticTheme = {
	...MINIMAL_MONO,
	id: 'minimal-mono-2',
	label: '简约黑白二',
	headingBox: undefined,
	headingBar: { level: 2, bgColor: '#1F1F1F', textColor: '#FFFFFF' },
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
	tableHeaderColor: '#8C4A22',
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
// Built around 中国红: reds in layers (deep 中国红 H1, 红绯 accent and H2 tab,
// 中国红/朱砂 H3–H4), 赤金 links (the classic red-and-gold pairing), and
// traditional pigments to tell callouts apart (朱红, 石青, 石绿, 藤黄, 胭脂,
// 黛紫). No page background: bgPrimary (white) only feeds callout tints.
// Bold stays body-colored so the page isn't flooded with red.

const CHINA_RED: StaticTheme = {
	id: 'china-red',
	label: '中国红',
	bgPrimary: '#FFFFFF',
	textNormal: '#2B2422',
	textMuted: '#6E5D57',
	textFaint: '#A3928B',
	textItalic: '#5C4A44',
	linkColor: '#9A6512',
	accent: '#E44B38',
	headings: ['#A61B1B', '#E44B38', '#C8291E', '#B4442E', '#8E5A3C', '#7A6A63'],
	highlightBg: '#FCE9C0',
	codeBackground: '#FAF3F1',
	tableHeaderColor: '#A61B1B',
	borderColor: '#EBD9D4',
	code: {
		normal: '#2B2422', comment: '#8E7E78', keyword: '#B3261E', function: '#9A6512',
		string: '#2D7A55', value: '#2B5F8F', tag: '#C8291E', property: '#9A5A2A',
		variable: '#9E2735', inline: '#B3261E',
	},
	calloutAccent: {
		note: '#C8291E', abstract: '#1E7470', info: '#2B5F8F', todo: '#C8291E',
		tip: '#2D7A55', success: '#2D7A55', question: '#9A5A2A', warning: '#9A6010',
		failure: '#9E2735', danger: '#9E2735', bug: '#86283A', example: '#6A4A8A', quote: '#7E6E66',
	},
	headingTab: { level: 2, color: '#E44B38', textColor: '#FFFFFF' },
	noUnderline: [1],
	taskAccent: { inProgress: '#2B5F8F', rescheduled: '#9A5A2A', question: '#9A6010', important: '#9E2735' },
	transparentPage: true,
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
	tableHeaderColor: '#1B5E3A',
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
	tableHeaderColor: '#9D4E61',
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
// Named after the classic "橙心" WeChat-markdown skin, but its coral (hue
// ~8°) read as red and sat right next to 中国红 — so the primary is now a
// true orange (hue ~25°), alternating with a jade secondary across heading
// levels. Text-weight uses of orange (links, bold, H1/H4) take deeper shades
// to stay ≥4.5:1 on white; red appears only for failure/danger/important.
// Suited to tech/knowledge-sharing blogs and general long-form writing.

const ORANGE_HEART: StaticTheme = {
	id: 'orange-heart',
	label: '橙心',
	bgPrimary: '#FFFFFF',
	textNormal: '#262626',
	textMuted: '#5C5C5C',
	textFaint: '#9B9B9B',
	textItalic: '#6B6B6B',
	linkColor: '#B35512',
	accent: '#DE6F22',
	headings: ['#A84F14', '#DE6F22', '#237563', '#B35512', '#9A6220', '#737373'],
	highlightBg: '#FDE6D0',
	codeBackground: '#F8F3EE',
	tableHeaderColor: '#A84F14',
	borderColor: '#EFE4DA',
	code: {
		normal: '#3A342E', comment: '#8A8077', keyword: '#B35512', function: '#237563',
		string: '#4D7636', value: '#2A6F8E', tag: '#B35512', property: '#237563',
		variable: '#9A6220', inline: '#237563',
	},
	// Orange/jade family plus a few distinct hues so types stay apart; all
	// titles ≥4.5:1 on white.
	calloutAccent: {
		note: '#B85A16',     // orange — the flagship type
		abstract: '#237563', // jade — matches H3
		info: '#2A6F8E',     // lake blue, distinct from abstract's jade
		todo: '#9A6220',     // amber-brown — matches H5
		tip: '#4D7636',      // grass green — matches code.string
		success: '#4D7636',
		question: '#94620B', // gold
		warning: '#94620B',
		failure: '#C0392B',  // vermilion — the only red, reserved for danger
		danger: '#C0392B',
		bug: '#9C4434',      // ochre red
		example: '#83617E',  // plum — a cool accent for contrast
		quote: '#766B62',    // warm taupe
	},
	// No flag: the near-white flag (#EEEBE9) read poorly against WeChat's
	// dark-mode page. The flag mechanism itself still works if re-enabled.
	headingBanner: { level: 2, textColor: '#FFFFFF' },
	taskAccent: { inProgress: '#237563', rescheduled: '#9A6220', question: '#94620B', important: '#C0392B' },
	transparentPage: true,
	boldColor: '#A84F14',
};

// ── 冷酷的仙境 (Hard-Boiled Wonderland) ───────────────────────────────────
// Named after Murakami's 世界の終りとハードボイルド・ワンダーランド. "Cold" is
// carried by hue, not darkness: a cool page, a steel-blue family for every
// heading level (deep navy → steel → slate), icy teal only as a sparse accent
// (links, H1 underline), and one muted slate-violet as the sole trace of the
// dreamlike half. Warning is the one deliberate warm note (cool brass) so it
// stays distinguishable. All heading/callout colors are ≥4.4:1 on white.

const HARDBOILED_WONDERLAND: StaticTheme = {
	id: 'hardboiled-wonderland',
	label: '冷酷的仙境',
	bgPrimary: '#EFF3F8',
	textNormal: '#24314A',
	textMuted: '#5C6B82',
	textFaint: '#8C97A8',
	textItalic: '#44536B',
	// Accent darkened 25%: the bright teal is only 3.3:1 on white, too
	// light for body-size link text.
	linkColor: '#17776B',
	accent: '#1E9E8F',
	headings: ['#22466E', '#2F5A84', '#3B6FA0', '#1D7F74', '#56708C', '#6B7A8F'],
	highlightBg: '#D6EDE9',
	codeBackground: '#E8EDF3',
	tableHeaderColor: '#2F5A84',
	borderColor: '#D5DCE6',
	code: {
		normal: '#24314A', comment: '#8C97A8', keyword: '#5E5A9A', function: '#1E9E8F',
		string: '#3B6FA0', value: '#2A7A96', tag: '#2B9388', property: '#3B6FA0',
		variable: '#5C6B82', inline: '#2B9388',
	},
	calloutAccent: {
		note: '#3B6FA0', abstract: '#1D7F74', info: '#2A7A96', todo: '#56708C',
		tip: '#1D7F74', success: '#1D7F74', question: '#5E5A9A', warning: '#8A6A2A',
		failure: '#A85B7D', danger: '#A85B7D', bug: '#8C5570',
		example: '#5E5A9A', quote: '#6B7A8F',
	},
	// Thin-stroked six-armed ice crystal (one SVG, not separate shapes) on a
	// near-colorless tag with a hard left edge — colder than the earlier soft
	// sparkle + lavender tag. Snow anchors the novel's walled-town winter.
	headingIcon: {
		level: 2,
		iconSvg: '<g fill="none" stroke="#4F86A8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
			[0, 60, 120, 180, 240, 300].map(a =>
				`<g transform="rotate(${a} 12 12)">` +
				'<path d="M12 12V2M12 6L9.5 3.5M12 6L14.5 3.5"/></g>',
			).join('') + '</g>',
		textColor: '#2F5A84',
		textBg: '#EEF2F6',
		barColor: '#2F5A84',
	},
	// Matches the H2 tag; not the teal family, which links use.
	boldColor: '#2F5A84',
	// Same colors as the matching callout types (note/todo/question/danger).
	taskAccent: { inProgress: '#3B6FA0', rescheduled: '#56708C', question: '#5E5A9A', important: '#A85B7D' },
	transparentPage: true,
};

export const STATIC_THEMES: Record<string, StaticTheme> = {
	'purple-mist': PURPLE_MIST,
	'minimal-mono': MINIMAL_MONO,
	'minimal-mono-2': MINIMAL_MONO_2,
	'warm-almond': WARM_ALMOND,
	'tech-blue': TECH_BLUE,
	'china-red': CHINA_RED,
	'forest-green': FOREST_GREEN,
	'sakura-pink': SAKURA_PINK,
	'graphite-dark': GRAPHITE_DARK,
	'orange-heart': ORANGE_HEART,
	'hardboiled-wonderland': HARDBOILED_WONDERLAND,
};

/**
 * Ordered list for building settings dropdowns: themes that have been
 * reworked and verified in WeChat first (order chosen by the user), then
 * the original palette-only presets, with the one dark theme last.
 */
export const STATIC_THEME_LIST: StaticTheme[] = [
	HARDBOILED_WONDERLAND, ORANGE_HEART, CHINA_RED, MINIMAL_MONO, MINIMAL_MONO_2, PURPLE_MIST,
	WARM_ALMOND, TECH_BLUE, FOREST_GREEN, SAKURA_PINK, GRAPHITE_DARK,
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

/** Old saved theme ids → current ids (settings are migrated on load). */
export const LEGACY_THEME_ALIASES: Record<string, string> = {
	light: 'purple-mist',              // before the theme registry existed
	'catppuccin-latte': 'purple-mist', // 马卡龙紫, reworked into 紫雾
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
		// The badge's own height used to be implicit (auto, driven purely by
		// padding + line-height + however WeChat's substituted font actually
		// renders that one line of bold text) — chasing a flag height to match
		// that unknown, font-dependent number turned into an unbounded
		// bisection (37/42/44px all left a gap; 45px overshot — the margin for
		// error is under a couple px and nothing pins down the real value).
		// Pinning the badge to an *explicit* height (box-sizing:border-box, so
		// padding is included rather than added on top) removes that unknown
		// entirely: both the badge and the flag now size off the same literal
		// number regardless of what font WeChat substitutes, instead of one
		// of them being at the mercy of real text-rendering metrics. The badge
		// switches from inline-block + line-height to inline-flex + centered
		// content so the text still sits in the middle of whatever height is
		// declared, even if real text metrics don't divide evenly into it.
		const badgeHeight = level === 1 ? 46 : 40;
		// Top corners only: the bottom stays square so the full-width underline
		// meets it cleanly. With a flag, the top-right stays square too, since
		// the flag butts against that edge.
		const radius = flagColor ? '6px 0 0 0' : '6px 6px 0 0';
		const badgeStyle =
			`display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; ` +
			`height: ${badgeHeight}px; background-color: ${theme.accent}; color: ${textColor}; ` +
			`font-size: ${fontSize}; font-weight: 700; padding: 0 18px; border-radius: ${radius};`;
		const wrapperStyle = `display: flex; align-items: center; margin: ${margin};` +
			`border-bottom: 2px solid ${theme.accent};`;
		// The flag is an <img> over an SVG data URI — the same trick callout
		// icons rely on. This is the one rendering primitive confirmed to
		// actually show *something* once pasted into WeChat; everything else
		// tried disappears outright:
		//   - CSS clip-path: stripped by WeChat's paste sanitizer.
		//   - A zero-size <span> faked into a triangle via border-width/
		//     border-color: also stripped entirely (most likely WeChat's
		//     sanitizer treats a 0×0 "empty" element as junk and drops it,
		//     border trick or not — confirmed by testing: no flag at all).
		//   - background-image (SVG on an empty flex-stretched span): avoids
		//     the <img> sizing issues below, but is *also* stripped.
		//   - calc()/em-relative CSS height on the <img>: didn't close the
		//     gap reliably — possibly calc() itself gets filtered, possibly
		//     the font-size it depends on does; a plain px value sidesteps
		//     the question entirely.
		//   - align-items:stretch pulling an auto-height badge up to match the
		//     flag: works, but only solves half the problem — the badge's
		//     *natural* height was itself the unknown being chased. Now that
		//     the badge has an explicit height too, the two just share the
		//     same literal `badgeHeight` number directly; no stretch needed.
		const flagHtml = flagColor
			? (() => {
				const flagWidth = 26;
				const svg =
					`<svg xmlns="http://www.w3.org/2000/svg" width="${flagWidth}" height="${badgeHeight}" ` +
					`viewBox="0 0 ${flagWidth} ${badgeHeight}" preserveAspectRatio="none">` +
					`<polygon points="0,0 0,${badgeHeight} ${flagWidth},${badgeHeight}" fill="${flagColor}"/></svg>`;
				const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
				return `<img src="${dataUri}" ` +
					`style="width: ${flagWidth}px; height: ${badgeHeight}px; display: block; margin-left: 6px;">`;
			})()
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
	if (theme.headingBox) {
		const { level, borderColor, quoteMarks } = theme.headingBox;
		const fontSize = level === 1 ? '22px' : '18px';
		const topMargin = level === 1 ? '1.5em' : '1.3em';
		const bottomMargin = level === 1 ? '0.8em' : '0.6em';
		const inset = 20; // how much narrower the box is than the container, each side
		const plusStyle = `font-size: 16px; font-weight: 700; line-height: 1; color: ${borderColor};`;
		// <section>, not <div>, for every piece here — not just the box that
		// carries background-color. Confirmed this session that a <div> can
		// vanish entirely on WeChat paste (not just lose its style), so there's
		// no safe case for using one where <section> costs nothing extra.
		// Corner "+" marks sit just inside the box via plain text-align, not
		// position:absolute straddling the border — another trick this session
		// confirmed is unreliable once pasted, on top of being unverifiable
		// without a real WeChat test each time it's touched.
		//
		// This originally also had a full-width rule above and below the box,
		// offset off its edges (overhanging one side, falling short of the
		// other) to match a reference screenshot. Dropped: those rules were
		// genuinely empty <section>s (just a border, no content), and WeChat's
		// paste sanitizer dropped them unpredictably — not deterministically
		// per-property like clip-path/background-image, but seemingly
		// cumulatively worse the more repeated heading instances were in the
		// pasted document (first H2 lost its bottom rule only, the next H2
		// lost both). Giving each rule real text content (an invisible
		// &nbsp;) didn't fix it either. Confirmed via a raw generated-HTML
		// dump (not the browser-corrected DOM) that our own markup is clean
		// and well-formed at every instance, so this isn't a tag-balance bug
		// on our end — it's WeChat's own handling of this repeated pattern,
		// outside what adjusting our CSS/HTML can reliably fix. The box
		// itself (border, corner "+" marks, centered title) is unaffected by
		// this and has been confirmed stable, so that's all that's left.
		const boxOpen =
			`<section style="border: 1px solid ${borderColor}; background-color: ${theme.bgPrimary}; ` +
			`margin: ${topMargin} ${inset}px ${bottomMargin} ${inset}px;">` +
			`<section style="padding: 0 8px 0 8px; ${plusStyle}">+</section>`;
		const boxClose =
			`<section style="padding: 0 8px 2px 8px; text-align: right; ${plusStyle}">+</section></section>`;
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		// Symmetric top/bottom padding — the earlier asymmetric 2px/14px made
		// the title look pushed toward the top instead of centered in the box.
		const headingStyle =
			`font-size: ${fontSize}; font-weight: 700; text-align: center; ` +
			`color: ${theme.textNormal}; margin: 0; padding: 0 20px; line-height: 1.25;`;
		// Plain CJK quote marks («title» in Chinese typography) wrapping the
		// title text — real text, not a separate element, so it carries none
		// of the "empty decorative tag" risk the dropped rule-lines above had.
		const quoteOpen = quoteMarks ? '「' : '';
		const quoteClose = quoteMarks ? '」' : '';
		map.push(
			[openSource, `${boxOpen}<${tag} style="${headingStyle}">${quoteOpen}`],
			[closeSource, `${quoteClose}</${tag}>${boxClose}`],
		);
	}
	if (theme.headingBar) {
		const { level, bgColor, textColor } = theme.headingBar;
		const fontSize = level === 1 ? '22px' : '18px';
		const margin = level === 1 ? '1.5em 0 0.8em 0' : '1.3em 0 0.6em 0';
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		// The heading tag itself just centers its content; the actual solid
		// bar is an inline-block <span> around the text, so the background
		// hugs the text width instead of spanning the full line.
		const headingStyle = `margin: ${margin}; text-align: center;`;
		const barStyle =
			`display: inline-block; font-size: ${fontSize}; font-weight: 700; ` +
			`color: ${textColor}; background-color: ${bgColor}; padding: 10px 16px; line-height: 1.3;`;
		map.push(
			[openSource, `<${tag} style="${headingStyle}"><span style="${barStyle}">`],
			[closeSource, `</span></${tag}>`],
		);
	}
	if (theme.headingTab) {
		const { level, color, textColor } = theme.headingTab;
		const fontSize = level === 1 ? '22px' : '18px';
		const margin = level === 1 ? '1.5em 0 0.8em 0' : '1.3em 0 0.6em 0';
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		// The heading's font-size/line-height match the tab's so its own line
		// strut can't stand taller than the tab, and vertical-align: top pins
		// the tab to the top of the line box — together they keep the tab
		// flush against the rule even when WeChat enlarges line-height.
		const headingStyle =
			`margin: ${margin}; text-align: center; border-top: 2px solid ${color}; ` +
			`font-size: ${fontSize}; line-height: 1.3;`;
		const tabStyle =
			`display: inline-block; vertical-align: top; font-size: ${fontSize}; font-weight: 700; ` +
			`color: ${textColor}; background-color: ${color}; padding: 8px 22px 10px; border-radius: 0 0 10px 10px;`;
		map.push(
			[openSource, `<${tag} style="${headingStyle}"><span style="${tabStyle}">`],
			[closeSource, `</span></${tag}>`],
		);
	}
	if (theme.headingGradient) {
		const { level, stops, color } = theme.headingGradient;
		const fontSize = level === 1 ? '24px' : '22px';
		const margin = level === 1 ? '1.5em 0 0.8em 0' : '1.3em 0 0.6em 0';
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		const headingStyle = `margin: ${margin}; text-align: center; font-size: ${fontSize}; font-weight: 700; line-height: 1.4;`;
		const textStyle =
			`color: ${color}; background-image: linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 55%, ${stops[2]} 100%); ` +
			`-webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;`;
		map.push(
			[openSource, `<${tag} style="${headingStyle}"><span style="${textStyle}">`],
			[closeSource, `</span></${tag}>`],
		);
	}
	if (theme.headingIcon) {
		const { level, iconSvg, textColor, textBg, barColor } = theme.headingIcon;
		const fontSize = level === 1 ? '22px' : '18px';
		const margin = level === 1 ? '1.5em 0 0.8em 0' : '1.3em 0 0.6em 0';
		const [openSource, closeSource] = level === 1
			? [H1_OPEN_SOURCE, H1_CLOSE_SOURCE]
			: [H2_OPEN_SOURCE, H2_CLOSE_SOURCE];
		const tag = level === 1 ? 'h1' : 'h2';
		// The heading just centers its content; the actual badge is an
		// inline-flex <span> wrapping *both* the icon and the text, so the
		// background covers the icon too instead of just framing the text
		// (the icon sitting outside the colored span, as in the first cut of
		// this design, left it looking like an unrelated bullet rather than
		// part of the same tag).
		const headingStyle = `margin: ${margin}; display: flex; justify-content: center;`;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${iconSvg}</svg>`;
		const iconHtml =
			`<img src="data:image/svg+xml,${encodeURIComponent(svg)}" ` +
			`style="width: 22px; height: 22px; margin-right: 8px; display: block;">`;
		const badgeStyle =
			`display: inline-flex; align-items: center; background-color: ${textBg}; padding: 4px 12px;` +
			(barColor ? ` border-left: 3px solid ${barColor};` : '');
		const textStyle = `font-size: ${fontSize}; font-weight: 700; color: ${textColor}; line-height: 1.3;`;
		map.push(
			[openSource, `<${tag} style="${headingStyle}"><span style="${badgeStyle}">${iconHtml}<span style="${textStyle}">`],
			[closeSource, `</span></span></${tag}>`],
		);
	}
	if (theme.noUnderline) {
		// Matched against the literal placeholder text (not theme.accent —
		// this has to run before the generic border-bottom→accent-color
		// substitution further down, which would otherwise color it in first
		// and leave nothing here to match against).
		const underlinePlaceholder: Record<1 | 2, RegExp> = {
			1: /; border-bottom: 2px solid #7c3aed; padding-bottom: 0\.3em/g,
			2: /; border-bottom: 1px solid #e5e5e5; padding-bottom: 0\.2em/g,
		};
		for (const level of theme.noUnderline) {
			map.push([underlinePlaceholder[level], '']);
		}
	}
	if (theme.boldColor) {
		// Lookbehind restricts this to <strong>'s own color: #1a1a1a, so the
		// generic text catch-all below still governs everywhere else.
		map.push([/(?<=<strong[^>]*?)color: #1a1a1a/g, `color: ${theme.boldColor}`]);
	}
	if (theme.taskAccent) {
		const taskPlaceholder: Record<'inProgress' | 'rescheduled' | 'question' | 'important', RegExp> = {
			inProgress:  /background-color: #4e96e0/g,
			rescheduled: /background-color: #d4820a/g,
			question:    /background-color: #ba8f00/g,
			important:   /background-color: #d44030/g,
		};
		for (const key of Object.keys(theme.taskAccent) as (keyof typeof taskPlaceholder)[]) {
			const color = theme.taskAccent[key];
			if (color) map.push([taskPlaceholder[key], `background-color: ${color}`]);
		}
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
		// H3–H6 placeholder underlines (see parser.ts) exist only for the
		// 'obsidian' live theme to detect and follow a real theme's border —
		// no static preset currently wants underlines below H2, so these
		// always get stripped back out, same as H1/H2 did before headingBanner
		// existed (and still do here, when a theme doesn't configure a banner
		// for that level — see the headingBanner branch below for H1/H2).
		[/; border-bottom: 1px solid #a1a1a1; padding-bottom: 0\.2em/g, ''],
		[/; border-bottom: 1px solid #a2a2a2; padding-bottom: 0\.2em/g, ''],
		[/; border-bottom: 1px solid #a3a3a3; padding-bottom: 0\.2em/g, ''],
		[/; border-bottom: 1px solid #a4a4a4; padding-bottom: 0\.2em/g, ''],
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
		[/color: #a9a9aa/g, `color: ${theme.textFaint}`], // strikethrough <s>
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
		[/color: #2d3748/g, `color: ${theme.tableHeaderColor ?? theme.accent}`],
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
		// ── List markers + nested-list indent guides ─────────────────────────
		[/color: #b0b0b1/g, `color: ${theme.textFaint}`],
		[/border-left: 1px solid #c0c0c1/g, `border-left: 1px solid ${theme.borderColor}`],
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

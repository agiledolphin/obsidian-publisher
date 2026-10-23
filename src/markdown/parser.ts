import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import plaintext from 'highlight.js/lib/languages/plaintext';

import { obsidianCalloutPlugin } from './plugins/callout';
import { obsidianWikiLinkPlugin } from './plugins/wikilink';
import { obsidianHighlightPlugin } from './plugins/highlight-mark';
import { obsidianStrikethroughPlugin } from './plugins/strikethrough';
import { obsidianTaskListPlugin } from './plugins/task-list';

// Register highlight.js languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);

/**
 * GitHub-inspired highlight.js color theme — maps class names to inline CSS.
 */
const HLJS_GITHUB_THEME: Record<string, string> = {
	'hljs-keyword':            'color: #cf222e;',
	'hljs-built_in':           'color: #8250df;',
	'hljs-type':               'color: #8250df;',
	'hljs-literal':            'color: #0550ae;',
	'hljs-number':             'color: #0550ae;',
	'hljs-regexp':             'color: #0a3069;',
	'hljs-string':             'color: #0a3069;',
	'hljs-subst':              'color: #24292f;',
	'hljs-symbol':             'color: #8250df;',
	'hljs-class':              'color: #8250df;',
	'hljs-function':           'color: #8250df;',
	'hljs-title':              'color: #8250df;',
	'hljs-title function_':    'color: #8250df;',
	'hljs-title class_':       'color: #8250df;',
	'hljs-params':             'color: #24292f;',
	'hljs-comment':            'color: #6e7781;',
	'hljs-doctag':             'color: #cf222e;',
	'hljs-meta':               'color: #953800;',
	'hljs-meta keyword':       'color: #cf222e;',
	'hljs-section':            'color: #0550ae; font-weight: bold;',
	'hljs-tag':                'color: #116329;',
	'hljs-name':               'color: #116329;',
	'hljs-attr':               'color: #0550ae;',
	'hljs-attribute':          'color: #0550ae;',
	'hljs-variable':           'color: #b45309;',
	'hljs-variable language_': 'color: #0550ae;',
	'hljs-bullet':             'color: #0550ae;',
	'hljs-emphasis':           'font-style: italic;',
	'hljs-strong':             'font-weight: bold;',
	'hljs-link':               'color: #0a3069; text-decoration: underline;',
	'hljs-quote':              'color: #6e7781;',
	'hljs-selector-tag':       'color: #116329;',
	'hljs-selector-id':        'color: #8250df;',
	'hljs-selector-class':     'color: #116329;',
	'hljs-selector-attr':      'color: #0550ae;',
	'hljs-selector-pseudo':    'color: #0550ae;',
	'hljs-template-tag':       'color: #953800;',
	'hljs-template-variable':  'color: #953800;',
	'hljs-addition':           'color: #116329; background-color: #dafbe1;',
	'hljs-deletion':           'color: #82071e; background-color: #ffebe9;',
	'hljs-operator':           'color: #cf222e;',
	'hljs-punctuation':        'color: #24292f;',
	'hljs-property':           'color: #0550ae;',
};

/**
 * Post-processes bash/sh highlighted code to add inline styles for
 * --flag and -f style arguments that HLJS does not tokenize.
 * Only operates on text nodes (content between > and <).
 * Uses #b45309 as a placeholder — applyObsidianOverrides replaces it with
 * the theme's codeVariable color later.
 */
function applyBashFlags(html: string): string {
	return html.replace(/>([^<]*)</g, (_, text: string) => {
		const highlighted = text.replace(
			/(^|\s)(-{1,2}[a-zA-Z][a-zA-Z0-9_-]*)/g,
			(_m: string, ws: string, flag: string) =>
				`${ws}<span style="color: #b45309;">${flag}</span>`,
		);
		return '>' + highlighted + '<';
	});
}

/**
 * Replaces class="hljs-*" spans with inline style equivalents.
 */
// WeChat ignores white-space: pre on paste and collapses code whitespace; make it explicit.
function preserveCodeWhitespace(html: string): string {
	return html
		.replace(/\n$/, '')
		.split(/(<[^>]+>)/)
		.map(part => part.startsWith('<') ? part : part
			.replace(/\t/g, '    ')
			.replace(/ /g, '&nbsp;')
			.replace(/\n/g, '<br>'))
		.join('');
}

function applyHljsTheme(html: string): string {
	return html.replace(/<span class="([^"]+)">/g, (_match, classes: string) => {
		const style = HLJS_GITHUB_THEME[classes] ?? HLJS_GITHUB_THEME[classes.split(' ')[0] ?? ''];
		return style ? `<span style="${style}">` : '<span>';
	});
}

export class MarkdownParser {
	private md: MarkdownIt;
	private insideDoneTask = false;
	private listStack: { ordered: boolean; next: number }[] = [];
	private itemTasks: (string | null)[] = [];
	private insideLink = false;

	constructor() {
		this.md = new MarkdownIt({
			html: true,
			linkify: true,
			typographer: false,
			breaks: true,    // single newline → <br> (matches Obsidian reading view behavior)
			highlight: (str, lang) => {
				let highlighted = '';
				if (lang && hljs.getLanguage(lang)) {
					try {
						highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
					} catch {
						highlighted = this.md.utils.escapeHtml(str);
					}
				} else {
					highlighted = this.md.utils.escapeHtml(str);
				}
				let themedCode = applyHljsTheme(highlighted);
				if (lang === 'bash' || lang === 'sh') {
					themedCode = applyBashFlags(themedCode);
				}
				themedCode = preserveCodeWhitespace(themedCode);
				return (
					`<pre style="background-color: #f6f8fa; border-radius: 6px; padding: 16px; ` +
					`overflow-x: auto; font-size: 14px; line-height: 1.6; margin: 1em 0; ` +
					`border: 1px solid #e1e4e8; white-space: pre;">` +
					`<code style="font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace; ` +
					`font-size: 14px; background: none; padding: 0; color: #24292f;">${themedCode}</code></pre>`
				);
			},
		});

		this.md
			.use(obsidianCalloutPlugin)      // also sets blockquote renderer rules
			.use(obsidianWikiLinkPlugin)
			.use(obsidianHighlightPlugin)
			.use(obsidianStrikethroughPlugin)
			.use(obsidianTaskListPlugin);

		this.applyRendererRules();
	}

	private applyRendererRules(): void {
		const md = this.md;

		// ── Paragraph ─────────────────────────────────────────────────
		// Skip empty paragraphs — these are left behind when the callout plugin
		// strips the header line from a one-line inline token.
		const isEmptyInline = (tokens: ReturnType<typeof md.parse>, idx: number) => {
			const next = tokens[idx + 1];
			return (
				next?.type === 'inline' &&
				!next.content &&
				!(next.children?.length)
			);
		};

		// Tight-list paragraphs are hidden (markdown-it marks them) — no <p>,
		// so items don't pick up paragraph margins. Paragraphs in loose
		// lists drop their bottom margin; the list rows space themselves.
		md.renderer.rules['paragraph_open'] = (tokens, idx) => {
			if (tokens[idx]?.hidden || isEmptyInline(tokens, idx)) return '';
			const margin = this.listStack.length > 0 ? '0' : '0 0 1em 0';
			if (this.insideDoneTask) {
				return `<p style="font-size: 16px; color: #888888; text-decoration: line-through; line-height: 1.75; margin: ${margin};">`;
			}
			return `<p style="font-size: 16px; color: inherit; line-height: 1.75; margin: ${margin};">`;
		};

		md.renderer.rules['paragraph_close'] = (tokens, idx) => {
			if (tokens[idx]?.hidden) return '';
			// Walk back to find the matching paragraph_open
			let depth = 0;
			for (let i = idx - 1; i >= 0; i--) {
				const t = tokens[i];
				if (!t) continue;
				if (t.type === 'paragraph_close') depth++;
				if (t.type === 'paragraph_open') {
					if (depth === 0) {
						if (isEmptyInline(tokens, i)) return '';
						break;
					}
					depth--;
				}
			}
			return '</p>';
		};

		// ── Headings ──────────────────────────────────────────────────
		const headingStyles: Record<string, string> = {
			h1: 'font-size: 24px; color: #1a1a1a; font-weight: 700; line-height: 1.3; margin: 1.5em 0 0.8em 0; border-bottom: 2px solid #7c3aed; padding-bottom: 0.3em;',
			h2: 'font-size: 20px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 1.3em 0 0.6em 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.2em;',
			// H3–H6 placeholder border-bottoms (#a1a1a1…#a4a4a4) exist only so the
			// 'obsidian' live theme can detect and follow a real theme's heading
			// underline at these levels (see engine.ts's readHeadingBorder) —
			// static themes always strip them back out (see themes.ts), since
			// none of the presets currently want underlines below H2.
			h3: 'font-size: 18px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 1.2em 0 0.5em 0; border-bottom: 1px solid #a1a1a1; padding-bottom: 0.2em;',
			h4: 'font-size: 16px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 1em 0 0.4em 0; border-bottom: 1px solid #a2a2a2; padding-bottom: 0.2em;',
			h5: 'font-size: 15px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 0.8em 0 0.3em 0; border-bottom: 1px solid #a3a3a3; padding-bottom: 0.2em;',
			h6: 'font-size: 14px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 0.8em 0 0.3em 0; border-bottom: 1px solid #a4a4a4; padding-bottom: 0.2em;',
		};
		md.renderer.rules['heading_open'] = (tokens, idx) => {
			const tag = tokens[idx]?.tag ?? 'h1';
			return `<${tag} style="${headingStyles[tag] ?? ''}">`;
		};

		// ── Inline code ───────────────────────────────────────────────
		md.renderer.rules['code_inline'] = (tokens, idx) => {
			const content = md.utils.escapeHtml(tokens[idx]?.content ?? '');
			return (
				`<code style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; ` +
				`border: 1px solid #e1e4e8; font-size: 14px; color: #c7254e; ` +
				`font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace;">${content}</code>`
			);
		};

		// ── Horizontal rule ───────────────────────────────────────────
		md.renderer.rules['hr'] = () =>
			`<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 2em 0;">`;

		// ── Images ────────────────────────────────────────────────────
		md.renderer.rules['image'] = (tokens, idx) => {
			const token = tokens[idx];
			const src   = token?.attrGet('src') ?? '';
			const alt   = token?.attrGet('alt') ?? '';
			const title = token?.attrGet('title');
			return (
				`<img src="${src}" alt="${alt}"` +
				(title ? ` title="${title}"` : '') +
				` style="max-width: 100%; border-radius: 4px; margin: 1em auto; display: block;">`
			);
		};

		// ── Links ─────────────────────────────────────────────────────
		md.renderer.rules['link_open'] = (tokens, idx) => {
			this.insideLink = true;
			const href = tokens[idx]?.attrGet('href') ?? '';
			return `<a href="${href}" style="color: #576b95; text-decoration: none;">`;
		};
		md.renderer.rules['link_close'] = () => {
			this.insideLink = false;
			return '</a>';
		};

		// ── Tables ────────────────────────────────────────────────────
		// markdown-it's table rule parses `:---:`/`---:`/`:---` column markers and
		// attaches the result as `style="text-align:<align>"` on each th/td token.
		const columnAlign = (tokens: MarkdownIt.Token[], idx: number): string => {
			const style = tokens[idx]?.attrGet('style');
			const m = style?.match(/text-align:\s*(left|center|right)/);
			return m?.[1] ?? 'left';
		};
		md.renderer.rules['table_open'] = () =>
			`<table style="border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 15px;">`;
		md.renderer.rules['th_open'] = (tokens, idx) =>
			`<th style="background-color: #f2f2f2; color: #2d3748; font-weight: 600; text-align: ${columnAlign(tokens, idx)}; padding: 10px 12px; border: 1px solid #ddd;">`;
		md.renderer.rules['td_open'] = (tokens, idx) =>
			`<td style="text-align: ${columnAlign(tokens, idx)}; padding: 10px 12px; border: 1px solid #ddd; vertical-align: top;">`;

		// ── Lists ─────────────────────────────────────────────────────
		// Drawn with <section>s instead of <ul>/<ol>/<li>: WeChat re-parses
		// pasted lists and mangles nesting (a third-level item got hoisted to
		// the second level, ahead of its siblings), and its native markers
		// ignore the theme. Each item is a flex row: a fixed marker column
		// (bullet, number or task checkbox) + a content column. A nested list
		// sits in its parent's content column and pulls back under the parent
		// marker, where its left border draws the indent guide.
		// Placeholders: #b0b0b1 = marker color, #c0c0c1 = guide color.
		const MARKER_COL = 32;   // marker column width; content starts here
		const MARKER_MID = 19;   // marker center, from the row's left edge
		const GUIDE = MARKER_COL - MARKER_MID;
		const markerBase = `flex-shrink: 0; width: ${MARKER_COL}px; box-sizing: border-box;`;
		const centered = `${markerBase} padding-left: ${2 * MARKER_MID - MARKER_COL}px; text-align: center;`;

		const openList = (ordered: boolean, start: number): string => {
			const nested = this.listStack.length > 0;
			this.listStack.push({ ordered, next: start });
			return nested
				? `<section style="margin: 0 0 0 -${GUIDE}px; padding-left: ${GUIDE - 1}px; border-left: 1px solid #c0c0c1;">`
				: `<section style="margin: 0.5em 0;">`;
		};
		const closeList = (): string => {
			this.listStack.pop();
			return '</section>';
		};
		md.renderer.rules['bullet_list_open'] = () => openList(false, 1);
		md.renderer.rules['ordered_list_open'] = (tokens, idx) =>
			openList(true, parseInt(tokens[idx]?.attrGet('start') ?? '1', 10) || 1);
		md.renderer.rules['bullet_list_close'] = closeList;
		md.renderer.rules['ordered_list_close'] = closeList;

		// Task checkbox placeholders: taskBoxesToImages() (style/task-icons.ts)
		// swaps each data-pub-task <span> for an image, reading its colors.
		const boxBase = `display: inline-block; width: 15px; height: 15px; border-radius: 3px; box-sizing: border-box; text-align: center; line-height: 15px; color: #ffffff; font-size: 11px; font-weight: normal;`;
		const taskBox: Record<string, string> = {
			'done':        `<span data-pub-task="done" style="${boxBase} background-color: #7c3aed;">✓</span>`,
			'cancelled':   `<span data-pub-task="cancelled" style="${boxBase} background-color: #9a9a9a;">–</span>`,
			'todo':        `<span data-pub-task="todo" style="display: inline-block; width: 15px; height: 15px; border-radius: 3px; box-sizing: border-box; border: 1.5px solid #c8ccd0;"></span>`,
			'in-progress': `<span data-pub-task="in-progress" style="${boxBase} background-color: #4e96e0;">/</span>`,
			'rescheduled': `<span data-pub-task="rescheduled" style="${boxBase} background-color: #d4820a; font-size: 15px; padding-left: 2px;">›</span>`,
			'question':    `<span data-pub-task="question" style="${boxBase} background-color: #ba8f00;">?</span>`,
			'important':   `<span data-pub-task="important" style="${boxBase} background-color: #d44030;">!</span>`,
		};

		md.renderer.rules['list_item_open'] = (tokens, idx) => {
			const list = this.listStack[this.listStack.length - 1] ?? { ordered: false, next: 1 };
			const attr = tokens[idx]?.attrGet('data-task');
			const task = attr && taskBox[attr] ? attr : null;
			this.itemTasks.push(task);

			let marker: string;
			if (task) {
				marker = `<span style="${centered}">${taskBox[task]}</span>`;
			} else if (list.ordered) {
				marker = `<span style="${markerBase} padding-right: 6px; text-align: right; color: #b0b0b1;">${list.next++}.</span>`;
			} else {
				marker = `<span style="${centered} color: #b0b0b1;">•</span>`;
			}

			const struck = task === 'done' || task === 'cancelled';
			if (struck) this.insideDoneTask = true;
			return (
				`<section style="display: flex; align-items: baseline; font-size: 16px; line-height: 1.75; padding: 0.1em 0;">` +
				marker +
				`<section style="flex: 1; min-width: 0;${struck ? ' color: #888888; text-decoration: line-through;' : ''}">`
			);
		};

		md.renderer.rules['list_item_close'] = () => {
			const task = this.itemTasks.pop();
			if (task === 'done' || task === 'cancelled') this.insideDoneTask = false;
			return '</section></section>';
		};

		// ── Emphasis / strong ─────────────────────────────────────────
		md.renderer.rules['strong_open'] = () => `<strong style="font-weight: 700; color: #1a1a1a;">`;
		// Inside a link the em must not override the link colour — omit color so it inherits.
		md.renderer.rules['em_open'] = () =>
			this.insideLink
				? `<em style="font-style: italic;">`
				: `<em style="font-style: italic; color: #4a5568;">`;
	}

	render(markdown: string): string {
		this.listStack = [];
		this.itemTasks = [];
		this.insideDoneTask = false;
		return this.md.render(markdown);
	}
}

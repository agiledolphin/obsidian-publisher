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
function applyHljsTheme(html: string): string {
	return html.replace(/<span class="([^"]+)">/g, (_match, classes: string) => {
		const style = HLJS_GITHUB_THEME[classes] ?? HLJS_GITHUB_THEME[classes.split(' ')[0] ?? ''];
		return style ? `<span style="${style}">` : '<span>';
	});
}

export class MarkdownParser {
	private md: MarkdownIt;

	constructor() {
		this.md = new MarkdownIt({
			html: true,
			linkify: true,
			typographer: false,
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

		md.renderer.rules['paragraph_open'] = (tokens, idx) => {
			if (isEmptyInline(tokens, idx)) return '';
			return `<p style="font-size: 16px; color: #333; line-height: 1.75; margin: 0 0 1em 0;">`;
		};

		md.renderer.rules['paragraph_close'] = (tokens, idx) => {
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
			h3: 'font-size: 18px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 1.2em 0 0.5em 0;',
			h4: 'font-size: 16px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 1em 0 0.4em 0;',
			h5: 'font-size: 15px; color: #1a1a1a; font-weight: 600; line-height: 1.3; margin: 0.8em 0 0.3em 0;',
			h6: 'font-size: 14px; color: #666; font-weight: 600; line-height: 1.3; margin: 0.8em 0 0.3em 0;',
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
				`font-size: 14px; color: #c7254e; ` +
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
			const href = tokens[idx]?.attrGet('href') ?? '';
			return `<a href="${href}" style="color: #576b95; text-decoration: none;">`;
		};

		// ── Tables ────────────────────────────────────────────────────
		md.renderer.rules['table_open'] = () =>
			`<table style="border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 15px;">`;
		md.renderer.rules['th_open'] = () =>
			`<th style="background-color: #f2f2f2; font-weight: 600; text-align: left; padding: 10px 12px; border: 1px solid #ddd;">`;
		md.renderer.rules['td_open'] = () =>
			`<td style="padding: 10px 12px; border: 1px solid #ddd; vertical-align: top;">`;

		// ── Lists ─────────────────────────────────────────────────────
		md.renderer.rules['bullet_list_open'] = () =>
			`<ul style="padding-left: 2em; margin: 0.5em 0;">`;
		md.renderer.rules['ordered_list_open'] = (tokens, idx) => {
			const start = tokens[idx]?.attrGet('start') ?? '1';
			return `<ol start="${start}" style="padding-left: 2em; margin: 0.5em 0;">`;
		};

		md.renderer.rules['list_item_open'] = (tokens, idx) => {
			const task = tokens[idx]?.attrGet('data-task');
			if (task === 'done') {
				return (
					`<li style="font-size: 16px; line-height: 1.75; margin: 0.3em 0; list-style: none; margin-left: -1.5em;">` +
					`<span style="margin-right: 6px;">✅</span>` +
					`<span style="text-decoration: line-through; color: #999;">`
				);
			}
			if (task === 'todo') {
				return (
					`<li style="font-size: 16px; line-height: 1.75; margin: 0.3em 0; list-style: none; margin-left: -1.5em;">` +
					`<span style="margin-right: 6px;">☐</span>`
				);
			}
			return `<li style="font-size: 16px; line-height: 1.75; margin: 0.3em 0;">`;
		};

		md.renderer.rules['list_item_close'] = (tokens, idx) => {
			let depth = 0;
			for (let i = idx - 1; i >= 0; i--) {
				const t = tokens[i];
				if (!t) continue;
				if (t.type === 'list_item_close') depth++;
				if (t.type === 'list_item_open') {
					if (depth === 0) {
						return t.attrGet('data-task') === 'done' ? '</span></li>' : '</li>';
					}
					depth--;
				}
			}
			return '</li>';
		};

		// ── Emphasis / strong ─────────────────────────────────────────
		md.renderer.rules['strong_open'] = () => `<strong style="font-weight: 700;">`;
		md.renderer.rules['em_open']     = () => `<em style="font-style: italic;">`;
	}

	render(markdown: string): string {
		return this.md.render(markdown);
	}
}

/**
 * Mermaid rendering: code blocks → PNG via Obsidian's MarkdownRenderer + Canvas.
 *
 * Strategy:
 * 1. Render each mermaid block offscreen inside a .markdown-preview-view context
 *    so Obsidian's scoped CSS overrides (dark theme colours, etc.) are applied.
 * 2. Read getComputedStyle() from the LIVE SVG elements (no DOM mutation → no
 *    MutationObserver crash from Mermaid's internal observers).
 * 3. Write the resolved styles onto a CLONE (clones have no observers → safe).
 * 4. Strip <style>, <foreignObject>, external URLs from the clone, then
 *    serialize → Blob URL → <img> → Canvas → PNG data URL.
 * 5. Falls back to a styled text block on any failure.
 */

import { App, MarkdownRenderer, Component } from 'obsidian';

const MERMAID_BLOCK = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

const SVG_PROPS = [
	'fill', 'fill-opacity', 'fill-rule',
	'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray',
	'stroke-linecap', 'stroke-linejoin',
	'opacity', 'color',
	'font-family', 'font-size', 'font-weight', 'font-style',
	'text-anchor', 'dominant-baseline', 'alignment-baseline',
	'display', 'visibility',
	'stop-color', 'stop-opacity',
];

/**
 * Reads computed styles from every element in liveSvg and writes them onto
 * the corresponding element in targetSvg (matched by querySelectorAll order).
 *
 * MUST be called while liveSvg is still attached to the document inside its
 * original CSS context (.markdown-preview-view) so getComputedStyle() returns
 * fully-resolved, theme-correct values.
 *
 * We read from the LIVE SVG and write to the CLONE — never the other way
 * around — because Mermaid attaches MutationObservers to the live SVG and
 * setAttribute() on those elements fires callbacks that throw at runtime.
 * Clones carry no observers, so setAttribute() on them is safe.
 */
function inlineComputedStyles(liveSvg: SVGSVGElement, targetSvg: SVGSVGElement): void {
	const liveEls  = Array.from(liveSvg.querySelectorAll<Element>('*'));
	const cloneEls = Array.from(targetSvg.querySelectorAll<Element>('*'));
	const len = Math.min(liveEls.length, cloneEls.length);
	for (let i = 0; i < len; i++) {
		const liveEl  = liveEls[i];
		const cloneEl = cloneEls[i];
		if (!liveEl || !cloneEl) continue;
		const computed = window.getComputedStyle(liveEl);
		const parts: string[] = [];
		for (const prop of SVG_PROPS) {
			const val = computed.getPropertyValue(prop);
			if (val && val !== '') parts.push(`${prop}:${val}`);
		}
		if (parts.length > 0) cloneEl.setAttribute('style', parts.join(';'));
	}
}

function findMermaidSvg(container: HTMLElement): SVGSVGElement | null {
	// Try known Obsidian wrapper selectors first.
	for (const sel of ['.mermaid svg', '.block-language-mermaid svg']) {
		const el = container.querySelector(sel);
		if (el instanceof SVGSVGElement) return el;
	}
	// Fall back: find the SVG that looks like a diagram, not a toolbar icon.
	// Icon SVGs are tiny (width/height attrs ≤ 32) and have few children.
	// Mermaid diagrams have many child elements regardless of display size.
	for (const svg of Array.from(container.querySelectorAll('svg'))) {
		if (!(svg instanceof SVGSVGElement)) continue;
		const wAttr = parseFloat(svg.getAttribute('width')  ?? '0');
		const hAttr = parseFloat(svg.getAttribute('height') ?? '0');
		const isIconSize = wAttr > 0 && wAttr <= 32 && hAttr > 0 && hAttr <= 32;
		if (isIconSize) continue;
		if (svg.querySelectorAll('*').length > 5) return svg;
	}
	return null;
}

function waitForSvg(container: HTMLElement, timeoutMs: number): Promise<SVGSVGElement | null> {
	return new Promise((resolve) => {
		const found = findMermaidSvg(container);
		if (found) { resolve(found); return; }

		const timer = window.setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);

		const observer = new MutationObserver(() => {
			const svg = findMermaidSvg(container);
			if (svg) {
				window.clearTimeout(timer);
				observer.disconnect();
				resolve(svg);
			}
		});
		observer.observe(container, { childList: true, subtree: true });
	});
}

/**
 * Clones the SVG and strips anything that would taint a canvas:
 * - <style> elements (inline styles make them redundant; they may contain
 *   var(), @font-face, or url() refs that Chromium treats as cross-origin)
 * - <foreignObject> elements (Chromium always taints a canvas that drew an
 *   SVG image containing foreignObject, regardless of content)
 * - <image> / <use> elements with external hrefs
 */
function cleanSvgEl(svg: SVGSVGElement): SVGSVGElement {
	const clone = svg.cloneNode(true) as SVGSVGElement;

	clone.querySelectorAll('style').forEach(el => el.remove());

	const svgNs = 'http://www.w3.org/2000/svg';
	const bStyle = getComputedStyle(document.body);
	const textColor  = bStyle.getPropertyValue('--text-normal').trim()  || '#333333';
	const fontFamily = bStyle.getPropertyValue('--font-mermaid').trim() ||
	                   bStyle.getPropertyValue('--font-text').trim()     || 'sans-serif';

	clone.querySelectorAll('foreignObject').forEach(fo => {
		const text = (fo.textContent ?? '').trim();
		if (text) {
			const x = parseFloat(fo.getAttribute('x')      ?? '0');
			const y = parseFloat(fo.getAttribute('y')      ?? '0');
			const w = parseFloat(fo.getAttribute('width')  ?? '0');
			const h = parseFloat(fo.getAttribute('height') ?? '0');
			const el = document.createElementNS(svgNs, 'text');
			el.setAttribute('x', String(x + w / 2));
			el.setAttribute('y', String(y + h / 2));
			el.setAttribute('text-anchor',       'middle');
			el.setAttribute('dominant-baseline', 'middle');
			el.setAttribute('font-size',         '14');
			el.setAttribute('fill',              textColor);
			el.style.fontFamily = fontFamily;
			el.textContent = text;
			fo.parentElement?.insertBefore(el, fo);
		}
		fo.remove();
	});

	clone.querySelectorAll('image').forEach(el => {
		for (const attr of ['href', 'xlink:href']) {
			const v = el.getAttribute(attr) ?? '';
			if (v && !v.startsWith('#') && !v.startsWith('data:')) el.removeAttribute(attr);
		}
	});

	clone.querySelectorAll('use').forEach(el => {
		const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
		if (href && !href.startsWith('#')) el.remove();
	});

	return clone;
}

async function svgToPng(svg: SVGSVGElement): Promise<{ dataUrl: string; w: number; h: number } | null> {
	const rect = svg.getBoundingClientRect();
	let w = rect.width;
	let h = rect.height;

	if (!w || !h) {
		const vb = svg.viewBox?.baseVal;
		w = vb?.width  ?? 400;
		h = vb?.height ?? 300;
	}
	w = Math.max(Math.round(w), 1);
	h = Math.max(Math.round(h), 1);

	// Clone BEFORE any modification — Mermaid attaches MutationObservers to
	// the live SVG, and setAttribute() on live elements triggers them, throwing
	// "eA.slice is not a function". Clones have no observers.
	const clone = svg.cloneNode(true) as SVGSVGElement;

	// Read computed styles from the LIVE SVG (no mutation → no observer trigger).
	// The live SVG is still inside its CSS context (.markdown-preview-view)
	// so getComputedStyle() returns fully-resolved, theme-correct values.
	// Write those resolved values onto the clone.
	inlineComputedStyles(svg, clone);

	const cleaned = cleanSvgEl(clone);
	const raw = new XMLSerializer().serializeToString(cleaned);
	const sized = raw.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
		const hasW = /\bwidth\s*=/.test(attrs);
		const hasH = /\bheight\s*=/.test(attrs);
		return `<svg${attrs}${hasW ? '' : ` width="${w}"`}${hasH ? '' : ` height="${h}"`}>`;
	});

	const blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
	const url  = URL.createObjectURL(blob);

	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			const scale  = 2;
			const canvas = document.createElement('canvas');
			canvas.width  = w * scale;
			canvas.height = h * scale;
			const ctx = canvas.getContext('2d');
			if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0, w, h);
			URL.revokeObjectURL(url);
			try {
				resolve({ dataUrl: canvas.toDataURL('image/png'), w, h });
			} catch (e) {
				console.error('[obsidian-publisher] Mermaid canvas tainted. SVG snippet:', sized.slice(0, 800));
				console.error(e);
				resolve(null);
			}
		};
		img.onerror = (e) => {
			console.error('[obsidian-publisher] Mermaid SVG image load failed:', e);
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

function buildFallback(definition: string): string {
	const escaped = definition
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	return (
		`<div style="background:#f5f5f5;border:1px solid #ddd;border-radius:4px;` +
		`padding:12px;margin:1em 0;font-family:monospace;font-size:13px;color:#888;` +
		`white-space:pre-wrap;">[Mermaid 图表]\n${escaped}</div>`
	);
}

/**
 * Replaces fenced mermaid code blocks in markdown with PNG <img> tags.
 * Blocks that fail to render fall back to a styled text placeholder.
 */
export async function processMermaid(markdown: string, app: App): Promise<string> {
	if (!markdown.includes('```mermaid')) return markdown;

	type Entry = { match: string; definition: string; placeholder: string };
	const entries: Entry[] = [];
	let counter = 0;

	let result = markdown.replace(MERMAID_BLOCK, (match, definition: string) => {
		const placeholder = `\x00MERMAID${counter++}\x00`;
		entries.push({ match, definition: definition.trim(), placeholder });
		return placeholder;
	});

	if (entries.length === 0) return markdown;

	// Always create a wrapper with .markdown-preview-view so Obsidian's Mermaid
	// post-processor fires (it only activates inside preview-view contexts).
	// Also picks up scoped CSS overrides for correct theme colours.
	const viewCtx = document.createElement('div');
	viewCtx.className = 'markdown-preview-view markdown-rendered';
	viewCtx.style.cssText =
		'position:fixed;top:-9999px;left:-9999px;width:800px;opacity:0;pointer-events:none;';
	document.body.appendChild(viewCtx);

	// Use Mermaid's built-in dark/default theme to match Obsidian's mode.
	// Obsidian applies dark colours via scoped CSS rules, but those rules can't
	// override Mermaid's own inline styles. Setting the Mermaid theme here
	// ensures the SVG is generated with the right colour palette from the start.
	// Also disable htmlLabels for flowcharts to avoid <foreignObject>, which
	// always taints a canvas when the SVG is loaded as a blob-URL <img>.
	const isDark = document.body.classList.contains('theme-dark');
	const initDirective =
		`%%{init: {"theme":"${isDark ? 'dark' : 'default'}","flowchart":{"htmlLabels":false}}}%%\n`;

	for (const entry of entries) {
		let replacement = buildFallback(entry.definition);
		try {
			const container = document.createElement('div');
			viewCtx.appendChild(container);

			const comp = new Component();
			comp.load();
			try {
				await MarkdownRenderer.render(
					app,
					'```mermaid\n' + initDirective + entry.definition + '\n```',
					container,
					'',
					comp
				);
				const svg = await waitForSvg(container, 5000);
				if (!svg) {
					console.warn('[obsidian-publisher] Mermaid: SVG not found within 5s for:', entry.definition.slice(0, 80));
				} else {
					const png = await svgToPng(svg);
					if (!png) {
						console.warn('[obsidian-publisher] Mermaid: PNG conversion failed for:', entry.definition.slice(0, 80));
					} else {
						replacement =
							`<img src="${png.dataUrl}" alt="Mermaid diagram" ` +
							`style="display:block;margin:1em auto;max-width:100%;width:${png.w}px;">`;
					}
				}
			} finally {
				comp.unload();
				container.remove();
			}
		} catch (err) {
			console.error('[obsidian-publisher] Mermaid render failed:', err);
		}
		result = result.split(entry.placeholder).join(replacement);
	}

	viewCtx.remove();
	return result;
}

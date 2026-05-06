/**
 * Math rendering: LaTeX → PNG via Obsidian's renderMath API + html2canvas.
 *
 * Uses renderMath() / finishRenderMath() from the obsidian module so that
 * MathJax is properly initialised regardless of whether the active leaf is in
 * reading mode or editing mode. All formulas are batched into a single
 * html2canvas pass inside an isolated iframe that contains only MathJax CSS.
 */

import html2canvas from 'html2canvas';
import { renderMath, finishRenderMath, loadMathJax } from 'obsidian';

function getTextColor(): string {
	const cssVar = getComputedStyle(document.body).getPropertyValue('--text-normal').trim();
	if (cssVar) return cssVar;
	return getComputedStyle(document.body).color || '#1a1a1a';
}

/**
 * Copies MathJax <style> elements into targetDoc, resolving any relative
 * font URLs to absolute so they load correctly in the isolated document.
 */
function injectMathJaxStyles(targetDoc: Document): void {
	const base = document.baseURI;
	document.querySelectorAll('style').forEach(styleEl => {
		const t = styleEl.textContent ?? '';
		if (!t.includes('mjx') && !t.includes('MJX') && !t.includes('MJXTEX') && !t.includes('MJXZERO')) return;
		const clone = targetDoc.createElement('style');
		clone.textContent = t.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url: string) => {
			if (/^(data:|https?:|app:|blob:|\/\/)/.test(url)) return match;
			try { return `url("${new URL(url, base).href}")`; }
			catch { return match; }
		});
		targetDoc.head.appendChild(clone);
	});
}

type PngResult = { dataUrl: string; w: number; h: number };

/**
 * Renders all formulas in one html2canvas pass inside an isolated iframe.
 * Returns { dataUrl, w, h } where w/h are 1x natural display dimensions.
 */
async function batchFormulasToPngs(
	formulas: Array<{ formula: string; display: boolean }>
): Promise<PngResult[]> {
	if (formulas.length === 0) return [];

	const textColor = getTextColor();

	// Ensure MathJax is loaded (no-op if already loaded).
	// Required in editing mode where Obsidian hasn't initialised MathJax yet.
	await loadMathJax();
	const mathEls = formulas.map(f => renderMath(f.formula, f.display));
	await finishRenderMath();

	// Pre-insert elements into the main document (offscreen) so the browser
	// actually downloads the STIX/MathJax font files before we move to the
	// iframe. iframeDoc.fonts.ready alone is unreliable in Electron — it can
	// resolve before fonts are painted. Once the browser has fetched the fonts
	// for the main document they are served from network cache in the iframe.
	const preload = document.createElement('div');
	preload.style.cssText =
		'position:fixed;top:-9999px;left:-9999px;width:2000px;opacity:0;pointer-events:none;';
	for (const el of mathEls) preload.appendChild(el);
	document.body.appendChild(preload);
	void preload.offsetHeight; // force layout → browser requests font files
	await document.fonts.ready;
	// Two rAF frames ensure at least one paint cycle has completed so fonts
	// are fully decoded and in the network cache before we move on.
	await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
	document.body.removeChild(preload);
	// mathEls are now detached but font data is cached by the browser.

	// Create an isolated iframe: html2canvas will only see MathJax CSS here.
	const iframe = document.createElement('iframe');
	iframe.style.cssText = [
		'position:fixed', 'top:-9999px', 'left:-9999px',
		'width:4000px',   'height:2000px',
		'border:none',    'opacity:0', 'pointer-events:none',
	].join(';');
	document.body.appendChild(iframe);

	const iframeDoc = iframe.contentDocument!;
	iframeDoc.body.style.cssText = 'margin:0;padding:0;background:transparent;';

	// Inject only MathJax styles (fonts absolutified) into the iframe.
	injectMathJaxStyles(iframeDoc);

	// Build wrapper and adopt MathJax elements into the iframe document.
	const wrapper = iframeDoc.createElement('div');
	Object.assign(wrapper.style, {
		position:   'absolute',
		top:        '0px',
		left:       '0px',
		display:    'block',
		color:      textColor,
		fontSize:   '16px',
		lineHeight: '1',
		fontWeight: 'normal',
		background: 'transparent',
	});

	const containers: HTMLDivElement[] = [];
	for (const el of mathEls) {
		const div = iframeDoc.createElement('div');
		div.style.cssText = 'display:block;padding:2px;width:fit-content;';
		// adoptNode moves the element into the iframe's document.
		div.appendChild(iframeDoc.adoptNode(el));
		wrapper.appendChild(div);
		containers.push(div);
	}
	iframeDoc.body.appendChild(wrapper);

	try {
		// Trigger initial layout so the browser knows which fonts are needed.
		void wrapper.offsetHeight;

		// Wait for fonts to finish loading in the iframe (should be fast as
		// they are already cached from the main-document preload step above).
		try { await iframeDoc.fonts.ready; } catch { /* non-fatal */ }

		// Re-force layout after fonts settle (font metrics affect dimensions).
		void wrapper.offsetHeight;

		// offsetLeft/offsetTop are relative to wrapper (the offset parent),
		// matching the canvas origin that html2canvas produces for this element.
		const positions = containers.map(c => ({
			x: c.offsetLeft,
			y: c.offsetTop,
			w: c.offsetWidth,
			h: c.offsetHeight,
		}));

		// Single html2canvas pass — only processes the iframe's MathJax CSS.
		const canvas = await html2canvas(wrapper, {
			scale:           2,
			backgroundColor: null,
			logging:         false,
			useCORS:         false,
		});

		const scale = 2;
		return positions.map(pos => {
			const px = Math.round(pos.x * scale);
			const py = Math.round(pos.y * scale);
			const pw = Math.ceil(pos.w  * scale);
			const ph = Math.ceil(pos.h  * scale);

			const crop = document.createElement('canvas');
			crop.width  = Math.max(pw, 1);
			crop.height = Math.max(ph, 1);
			const ctx = crop.getContext('2d');
			if (!ctx) return { dataUrl: '', w: pos.w, h: pos.h };
			ctx.drawImage(canvas, px, py, pw, ph, 0, 0, pw, ph);
			return { dataUrl: crop.toDataURL('image/png'), w: pos.w, h: pos.h };
		});
	} finally {
		document.body.removeChild(iframe);
	}
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Replaces LaTeX math in markdown with PNG <img> tags.
 * Skips fenced code blocks. Processes $$…$$ before $…$.
 */
export async function processMath(markdown: string): Promise<string> {
	if (!markdown.includes('$')) return markdown;

	const segments = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

	// ── First pass: collect all formulas, replace with placeholders ──
	type FormulaEntry = { formula: string; display: boolean; placeholder: string };
	const formulaList: FormulaEntry[] = [];
	let counter = 0;

	const segmentsWithPlaceholders = segments.map((seg, i) => {
		if (i % 2 === 1) return seg; // code block — skip

		seg = seg.replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => {
			const placeholder = `\x00MATH${counter++}\x00`;
			formulaList.push({ formula: inner.trim(), display: true, placeholder });
			return placeholder;
		});

		seg = seg.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, inner) => {
			const placeholder = `\x00MATH${counter++}\x00`;
			formulaList.push({ formula: inner.trim(), display: false, placeholder });
			return placeholder;
		});

		return seg;
	});

	if (formulaList.length === 0) return markdown;

	// ── Batch-render all formulas in one html2canvas pass ──
	let results: PngResult[];
	try {
		results = await batchFormulasToPngs(
			formulaList.map(f => ({ formula: f.formula, display: f.display }))
		);
	} catch (err) {
		console.error('[obsidian-publisher] Math batch render failed:', err);
		return markdown;
	}

	// ── Second pass: replace placeholders with <img> tags ──
	return segmentsWithPlaceholders.map((seg, i) => {
		if (i % 2 === 1) return seg;

		formulaList.forEach((entry, idx) => {
			if (!seg.includes(entry.placeholder)) return;
			const result = results[idx];
			if (!result?.dataUrl) {
				seg = seg.split(entry.placeholder).join(entry.formula);
				return;
			}
			const { dataUrl, w, h } = result;
			// Explicit 1x width so the 2x PNG displays at the correct visual size.
			const style = entry.display
				? `display:block;margin:1em auto;width:${w}px;height:auto;max-width:100%;`
				: `display:inline-block;vertical-align:middle;width:${w}px;height:auto;`;
			const img = `<img src="${dataUrl}" alt="${escapeAttr(entry.formula)}" style="${style}">`;
			seg = seg.split(entry.placeholder).join(img);
		});

		return seg;
	}).join('');
}

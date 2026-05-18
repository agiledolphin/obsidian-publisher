import { sanitizeHTMLToDom } from 'obsidian';

/**
 * Reads theme CSS properties needed by the preview.
 * Returns a map of CSS custom property name → value to be set on the preview
 * container so that styles.css rules (which use var(--pub-*)) pick them up.
 */
export function readThemeVars(): Record<string, string> {
	const result: Record<string, string> = {
		'--pub-guide-left':       '-8px',
		'--pub-guide-color':      'rgba(128, 128, 128, 0.3)',
		'--pub-guide-width':      '1px',
		'--pub-guide-top':        '0px',
		'--pub-guide-bottom':     '0px',
		'--pub-line-height':      '1.75',
		'--pub-li-padding-top':   '0px',
		'--pub-li-padding-bottom':'0px',
		'--pub-ul-margin-top':    '0px',
		'--pub-ul-margin-bottom': '0px',
	};

	const viewEl = document.querySelector('.markdown-preview-view');
	if (!viewEl) return result;

	// Read mark (==highlight==) colors from the live theme context so the preview
	// matches Obsidian's reading view exactly, even if theme CSS uses scoped selectors
	// or !important that would override inline styles on the inserted DOM elements.
	const markProbe = document.createElement('mark');
	markProbe.textContent = 'X';
	markProbe.classList.add('publisher-offscreen');
	viewEl.appendChild(markProbe);
	try {
		const cs = getComputedStyle(markProbe);
		result['--pub-mark-bg']    = cs.backgroundColor;
		result['--pub-mark-color'] = cs.color;
	} finally {
		viewEl.removeChild(markProbe);
	}

	// Read strikethrough color from the live theme context.
	// Use <del> probe (sanitizeHTMLToDom converts <del> → <s>, so we read from <del>
	// which shares the same CSS rules as <s> in most themes).
	const delProbe = document.createElement('del');
	delProbe.textContent = 'X';
	delProbe.classList.add('publisher-offscreen');
	viewEl.appendChild(delProbe);
	try {
		result['--pub-del-color'] = getComputedStyle(delProbe).color;
	} finally {
		viewEl.removeChild(delProbe);
	}

	const outer = document.createElement('ul');
	outer.classList.add('publisher-offscreen');
	const li    = document.createElement('li');
	const inner = document.createElement('ul');
	inner.classList.add('has-list-bullet');
	li.appendChild(inner);
	outer.appendChild(li);
	viewEl.appendChild(outer);

	try {
		const viewCs   = getComputedStyle(viewEl);
		const beforeCs = getComputedStyle(inner, '::before');
		const ulCs     = getComputedStyle(inner);

		const indentColor = viewCs.getPropertyValue('--indentation-guide-color').trim();
		if (indentColor) result['--pub-guide-color'] = indentColor;

		const left = beforeCs.left;
		if (left && left !== 'auto') result['--pub-guide-left'] = left;

		const varWidth = viewCs.getPropertyValue('--indentation-guide-width').trim();
		const beforeW  = beforeCs.width !== '0px' && beforeCs.width !== 'auto' ? beforeCs.width : '';
		const beforeBW = beforeCs.borderLeftWidth !== '0px' ? beforeCs.borderLeftWidth : '';
		const ulBW     = ulCs.borderLeftWidth     !== '0px' ? ulCs.borderLeftWidth     : '';
		const width    = varWidth || beforeW || beforeBW || ulBW;
		if (width) result['--pub-guide-width'] = width;

		const top    = beforeCs.top;
		const bottom = beforeCs.bottom;
		if (top    && top    !== 'auto') result['--pub-guide-top']    = top;
		if (bottom && bottom !== 'auto') result['--pub-guide-bottom'] = bottom;

		result['--pub-ul-margin-top']    = ulCs.marginTop;
		result['--pub-ul-margin-bottom'] = ulCs.marginBottom;

		const probeUl = document.createElement('ul');
		probeUl.classList.add('publisher-offscreen', 'has-list-bullet');
		const probeLi = document.createElement('li');
		probeLi.textContent = 'X';
		probeUl.appendChild(probeLi);
		viewEl.appendChild(probeUl);
		try {
			const liCs = getComputedStyle(probeLi);
			const lhPx = parseFloat(liCs.lineHeight);
			const fsPx = parseFloat(liCs.fontSize) || 16;
			if (!isNaN(lhPx) && lhPx > 0) {
				result['--pub-line-height'] = String(+(lhPx / fsPx).toFixed(4));
			}
			result['--pub-li-margin-top']    = liCs.marginTop;
			result['--pub-li-margin-bottom'] = liCs.marginBottom;
			result['--pub-li-padding-top']   = liCs.paddingTop;
			result['--pub-li-padding-bottom']= liCs.paddingBottom;
		} finally {
			viewEl.removeChild(probeUl);
		}
	} finally {
		viewEl.removeChild(outer);
	}
	return result;
}

/**
 * Inserts rendered HTML into container and applies all theme-based post-processing:
 * line-height, li margins/padding, nested list margins, checkbox alignment.
 */
export function applyPreviewContent(
	container: HTMLElement,
	html: string,
	themeVars: Record<string, string>
): void {
	// sanitizeHTMLToDom strips data: URLs from img src attributes.
	// Extract them first, replace with a stable index attribute, then restore
	// via .src property assignment after sanitization (property writes bypass
	// the sanitizer which only processes the initial HTML string).
	const dataUrls: string[] = [];
	const safeHtml = html.replace(
		/<img([^>]*?)src="(data:[^"]+)"([^>]*?)>/g,
		(_m, before: string, dataUrl: string, after: string) => {
			const idx = dataUrls.push(dataUrl) - 1;
			return `<img${before}data-pub-src="${idx}"${after}>`;
		}
	);

	container.empty();
	container.appendChild(sanitizeHTMLToDom(safeHtml));

	container.querySelectorAll<HTMLImageElement>('img[data-pub-src]').forEach((img) => {
		const idx = parseInt(img.getAttribute('data-pub-src') ?? '', 10);
		if (!isNaN(idx) && dataUrls[idx]) img.src = dataUrls[idx];
		img.removeAttribute('data-pub-src');
	});

	for (const [prop, val] of Object.entries(themeVars)) {
		container.style.setProperty(prop, val);
	}

	const lineHeight = themeVars['--pub-line-height'] ?? '1.75';
	container.querySelectorAll('p, li').forEach((el) => {
		(el as HTMLElement).style.setProperty('line-height', lineHeight);
	});

	const liStyle: Record<string, string> = {
		'margin-top':     themeVars['--pub-li-margin-top']     ?? '0px',
		'margin-bottom':  themeVars['--pub-li-margin-bottom']  ?? '0px',
		'padding-top':    themeVars['--pub-li-padding-top']    ?? '0px',
		'padding-bottom': themeVars['--pub-li-padding-bottom'] ?? '0px',
	};
	container.querySelectorAll('li').forEach((el) => {
		for (const [p, v] of Object.entries(liStyle)) {
			(el as HTMLElement).style.setProperty(p, v);
		}
	});

	const nestedListStyle: Record<string, string> = {
		'margin-top':    themeVars['--pub-ul-margin-top']    ?? '0px',
		'margin-bottom': themeVars['--pub-ul-margin-bottom'] ?? '0px',
	};
	container.querySelectorAll('li > ul, li > ol').forEach((el) => {
		for (const [p, v] of Object.entries(nestedListStyle)) {
			(el as HTMLElement).style.setProperty(p, v);
		}
	});

	const lineHeightPx = parseFloat(lineHeight) * 16;
	const checkboxMarginTop = `${Math.max(0, Math.round((lineHeightPx - 15) / 2))}px`;
	container.querySelectorAll<HTMLElement>('li > span:first-child').forEach((el) => {
		el.style.setProperty('margin-top', checkboxMarginTop);
	});

	// Override mark and del colors after DOM insertion so that Obsidian theme CSS
	// (which may use !important or scoped selectors our container doesn't match)
	// cannot interfere with the colors we read from the live preview context.
	const markBg    = themeVars['--pub-mark-bg'];
	const markColor = themeVars['--pub-mark-color'];
	if (markBg || markColor) {
		container.querySelectorAll<HTMLElement>('mark').forEach((el) => {
			if (markBg)    el.style.setProperty('background-color', markBg,    'important');
			if (markColor) el.style.setProperty('color',            markColor, 'important');
		});
	}

	const delColor = themeVars['--pub-del-color'];
	if (delColor) {
		// sanitizeHTMLToDom converts <del> → <s>, so query both for robustness.
		container.querySelectorAll<HTMLElement>('del, s').forEach((el) => {
			el.style.setProperty('color', delColor, 'important');
		});
	}
}

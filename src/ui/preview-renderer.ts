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
	container.empty();
	container.appendChild(sanitizeHTMLToDom(html));

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
}

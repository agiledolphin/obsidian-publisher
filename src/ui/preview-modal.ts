import { App, Modal, Notice, sanitizeHTMLToDom } from 'obsidian';
import { copyRichText } from '../clipboard/writer';

/** Shows the raw HTML source so users can diagnose WeChat compatibility issues. */
class SourceModal extends Modal {
	constructor(app: App, private html: string) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'HTML 源码' });

		const pre = contentEl.createEl('pre', { cls: 'publisher-source-pre' });
		pre.textContent = this.html;

		const bar = contentEl.createDiv({ cls: 'publisher-preview-toolbar' });
		const copyBtn = bar.createEl('button', { text: '复制源码', cls: 'publisher-btn-primary' });
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(this.html)
				.then(() => new Notice('源码已复制'))
				.catch(() => new Notice('复制失败'));
		});
		bar.createEl('button', { text: '关闭', cls: 'publisher-btn-secondary' })
			.addEventListener('click', () => this.close());
	}

	onClose(): void { this.contentEl.empty(); }
}

/**
 * Reads theme CSS properties needed by the preview.
 * Returns a map of CSS custom property name → value to be set on the preview
 * container so that styles.css rules (which use var(--pub-*)) pick them up.
 *
 * Covers: indentation guide (left, color, width) and line height.
 */
function readThemeVars(): Record<string, string> {
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

	// Build probe: outer ul > li > inner ul.has-list-bullet so the theme's
	// .markdown-preview-view ul.has-list-bullet::before selector actually fires.
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

		// ── Indentation guide color ───────────────────────────────────
		const indentColor = viewCs.getPropertyValue('--indentation-guide-color').trim();
		if (indentColor) result['--pub-guide-color'] = indentColor;

		// ── Indentation guide left offset ─────────────────────────────
		const left = beforeCs.left;
		if (left && left !== 'auto') result['--pub-guide-left'] = left;


		// ── Indentation guide width ────────────────────────────────────
		// Try: CSS variable → ::before width → ::before border-left → ul border-left
		const varWidth = viewCs.getPropertyValue('--indentation-guide-width').trim();
		const beforeW  = beforeCs.width !== '0px' && beforeCs.width !== 'auto' ? beforeCs.width : '';
		const beforeBW = beforeCs.borderLeftWidth !== '0px' ? beforeCs.borderLeftWidth : '';
		const ulBW     = ulCs.borderLeftWidth     !== '0px' ? ulCs.borderLeftWidth     : '';
		const width    = varWidth || beforeW || beforeBW || ulBW;
		if (width) result['--pub-guide-width'] = width;

		// ── Indentation guide top / bottom extent ──────────────────────
		const top    = beforeCs.top;
		const bottom = beforeCs.bottom;
		if (top    && top    !== 'auto') result['--pub-guide-top']    = top;
		if (bottom && bottom !== 'auto') result['--pub-guide-bottom'] = bottom;

		// ── Nested ul/ol margin (li > ul) ────────────────────────────
		result['--pub-ul-margin-top']    = ulCs.marginTop;
		result['--pub-ul-margin-bottom'] = ulCs.marginBottom;

		// ── Line height, li margin & li padding ──────────────────────
		// Must add 'has-list-bullet' so theme selectors like
		// ul.has-list-bullet > li { line-height: … } actually fire.
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
				result['--pub-line-height']      = String(+(lhPx / fsPx).toFixed(4));
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

export class PreviewModal extends Modal {
	constructor(app: App, private html: string) {
		super(app);
		this.modalEl.addClass('publisher-preview-modal');
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '公众号预览' });

		// Phone-width preview container
		const preview = contentEl.createDiv({ cls: 'publisher-preview-phone' });
		preview.appendChild(sanitizeHTMLToDom(this.html));

		// Inject theme-read CSS variables (indent guide) onto the container.
		const themeVars = readThemeVars();
		for (const [prop, val] of Object.entries(themeVars)) {
			preview.style.setProperty(prop, val);
		}

		// Apply the theme's actual line-height and li margins directly to every
		// p and li so they override hard-coded inline values from the parser.
		// We write via setProperty (variable key) to satisfy the ESLint rule.
		const lineHeight = themeVars['--pub-line-height'] ?? '1.75';
		const lhStyle: Record<string, string> = { 'line-height': lineHeight };
		preview.querySelectorAll('p, li').forEach((el) => {
			for (const [p, v] of Object.entries(lhStyle)) {
				(el as HTMLElement).style.setProperty(p, v);
			}
		});

		// Apply theme li margins and padding to match reading-mode appearance.
		const liStyle: Record<string, string> = {
			'margin-top':     themeVars['--pub-li-margin-top']     ?? '0px',
			'margin-bottom':  themeVars['--pub-li-margin-bottom']  ?? '0px',
			'padding-top':    themeVars['--pub-li-padding-top']    ?? '0px',
			'padding-bottom': themeVars['--pub-li-padding-bottom'] ?? '0px',
		};
		preview.querySelectorAll('li').forEach((el) => {
			for (const [p, v] of Object.entries(liStyle)) {
				(el as HTMLElement).style.setProperty(p, v);
			}
		});

		// Override nested list margins — the parser emits "margin: 0.5em 0" on all
		// ul/ol, but themes typically set nested ul/ol margins to 0 in reading mode.
		const nestedListStyle: Record<string, string> = {
			'margin-top':    themeVars['--pub-ul-margin-top']    ?? '0px',
			'margin-bottom': themeVars['--pub-ul-margin-bottom'] ?? '0px',
		};
		preview.querySelectorAll('li > ul, li > ol').forEach((el) => {
			for (const [p, v] of Object.entries(nestedListStyle)) {
				(el as HTMLElement).style.setProperty(p, v);
			}
		});

		// Align task-list checkbox spans with the first text line.
		// The parser hardcodes margin-top: 4px but the correct value depends on the
		// theme's actual line-height: (line-height_px - checkbox_height) / 2.
		// Task list li uses font-size 16px, checkbox height is 15px.
		const lineHeightPx = parseFloat(lineHeight) * 16;
		const checkboxMarginTop = `${Math.max(0, Math.round((lineHeightPx - 15) / 2))}px`;
		preview.querySelectorAll<HTMLElement>('li > span:first-child').forEach((el) => {
			el.style.setProperty('margin-top', checkboxMarginTop);
		});

		// Toolbar — close on the left, actions on the right
		const toolbar = contentEl.createDiv({ cls: 'publisher-preview-toolbar' });

		const closeBtn = toolbar.createEl('button', {
			text: '关闭',
			cls: 'publisher-btn-secondary publisher-btn-close',
		});
		closeBtn.addEventListener('click', () => this.close());

		const sourceBtn = toolbar.createEl('button', {
			text: '查看源码',
			cls: 'publisher-btn-secondary',
		});
		sourceBtn.addEventListener('click', () => {
			const sourceModal = new SourceModal(this.app, this.html);
			sourceModal.open();
		});

		const copyBtn = toolbar.createEl('button', {
			text: '复制到剪贴板',
			cls: 'publisher-btn-primary',
		});
		copyBtn.addEventListener('click', () => {
			// Sync line-height to the preview value (engine.ts may produce a
			// slightly different value; the probe in readThemeVars() is authoritative).
			const lh = themeVars['--pub-line-height'] ?? '1.75';
			const syncedHtml = this.html.replace(/\bline-height:\s*[\d.]+/g, `line-height: ${lh}`);
			copyRichText(syncedHtml)
				.then(() => {
					new Notice('✅ 已复制！请到公众号编辑器中粘贴。');
					this.close();
				})
				.catch(() => {
					new Notice('❌ 复制失败，请检查浏览器权限。');
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

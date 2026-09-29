import { App, Modal, Notice, TFile } from 'obsidian';
import type ObsidianPublisher from '../main';
import { copyRichText } from '../clipboard/writer';
import { readThemeVars, applyPreviewContent } from './preview-renderer';
import { THEME_OPTIONS } from '../style/themes';

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

export class PreviewModal extends Modal {
	private html = '';
	private previewEl!: HTMLElement;

	constructor(app: App, private plugin: ObsidianPublisher, private file: TFile) {
		super(app);
		this.modalEl.addClass('publisher-preview-modal');
	}

	/** (Re)converts the file for the current theme setting and re-renders the preview. */
	private async renderContent(): Promise<void> {
		try {
			this.html = await this.plugin.controller.convert(this.file);
		} catch (e) {
			new Notice(`❌ 预览失败：${(e as Error).message}`);
			return;
		}
		applyPreviewContent(this.previewEl, this.html, readThemeVars(), this.plugin.settings.theme);
	}

	/** Attaches drag-to-move behaviour to the modal, using handle as the grab target. */
	private makeDraggable(handle: HTMLElement): void {
		handle.addClass('publisher-drag-handle');

		let isDragging = false;
		let originX = 0, originY = 0, startLeft = 0, startTop = 0;

		const onMove = (e: MouseEvent) => {
			if (!isDragging) return;
			Object.assign(this.modalEl.style, {
				left: `${startLeft + (e.clientX - originX)}px`,
				top:  `${startTop  + (e.clientY - originY)}px`,
			});
		};

		const onUp = () => {
			isDragging = false;
			handle.removeClass('publisher-drag-handle-active');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup',   onUp);
		};

		handle.addEventListener('mousedown', (e: MouseEvent) => {
			const rect = this.modalEl.getBoundingClientRect();
			Object.assign(this.modalEl.style, {
				position:  'fixed',
				left:      `${rect.left}px`,
				top:       `${rect.top}px`,
				transform: 'none',
				margin:    '0',
			});

			isDragging = true;
			handle.addClass('publisher-drag-handle-active');
			originX   = e.clientX;
			originY   = e.clientY;
			startLeft = rect.left;
			startTop  = rect.top;

			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup',   onUp);
			e.preventDefault();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const title = contentEl.createEl('h2', { text: '公众号预览' });
		this.makeDraggable(title);

		this.previewEl = contentEl.createDiv({ cls: 'publisher-preview-phone' });

		// Toolbar — close on the left, theme switcher + actions on the right
		const toolbar = contentEl.createDiv({ cls: 'publisher-preview-toolbar' });

		const closeBtn = toolbar.createEl('button', {
			text: '关闭',
			cls: 'publisher-btn-secondary publisher-btn-close',
		});
		closeBtn.addEventListener('click', () => this.close());

		const themeSelect = toolbar.createEl('select', { cls: 'dropdown' });
		for (const opt of THEME_OPTIONS) {
			themeSelect.createEl('option', { value: opt.id, text: opt.label });
		}
		themeSelect.value = this.plugin.settings.theme;
		themeSelect.addEventListener('change', () => {
			this.plugin.settings.theme = themeSelect.value;
			void this.plugin.saveSettings().then(() => this.renderContent());
		});

		const sourceBtn = toolbar.createEl('button', {
			text: '查看源码',
			cls: 'publisher-btn-secondary',
		});
		sourceBtn.addEventListener('click', () => new SourceModal(this.app, this.html).open());

		const copyBtn = toolbar.createEl('button', {
			text: '复制到剪贴板',
			cls: 'publisher-btn-primary',
		});
		copyBtn.addEventListener('click', () => {
			const lh = readThemeVars()['--pub-line-height'] ?? '1.75';
			const synced = this.html.replace(/\bline-height:\s*[\d.]+/g, `line-height: ${lh}`);
			copyRichText(synced)
				.then(() => {
					new Notice('✅ 已复制！请到公众号编辑器中粘贴。');
					this.close();
				})
				.catch(() => new Notice('❌ 复制失败，请检查浏览器权限。'));
		});

		void this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

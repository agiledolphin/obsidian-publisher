import { App, Modal, Notice } from 'obsidian';
import { copyRichText } from '../clipboard/writer';
import { readThemeVars, applyPreviewContent } from './preview-renderer';

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
	constructor(app: App, private html: string) {
		super(app);
		this.modalEl.addClass('publisher-preview-modal');
	}

	/** Attaches drag-to-move behaviour to the modal, using handle as the grab target. */
	private makeDraggable(handle: HTMLElement): void {
		handle.style.cursor = 'grab';

		let isDragging = false;
		let originX = 0, originY = 0, startLeft = 0, startTop = 0;

		const onMove = (e: MouseEvent) => {
			if (!isDragging) return;
			this.modalEl.style.left = `${startLeft + (e.clientX - originX)}px`;
			this.modalEl.style.top  = `${startTop  + (e.clientY - originY)}px`;
		};

		const onUp = () => {
			isDragging = false;
			handle.style.cursor = 'grab';
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup',   onUp);
		};

		handle.addEventListener('mousedown', (e: MouseEvent) => {
			const rect = this.modalEl.getBoundingClientRect();
			this.modalEl.style.position  = 'fixed';
			this.modalEl.style.left      = `${rect.left}px`;
			this.modalEl.style.top       = `${rect.top}px`;
			this.modalEl.style.transform = 'none';
			this.modalEl.style.margin    = '0';

			isDragging = true;
			handle.style.cursor = 'grabbing';
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

		const themeVars = readThemeVars();

		const preview = contentEl.createDiv({ cls: 'publisher-preview-phone' });
		applyPreviewContent(preview, this.html, themeVars);

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
		sourceBtn.addEventListener('click', () => new SourceModal(this.app, this.html).open());

		const copyBtn = toolbar.createEl('button', {
			text: '复制到剪贴板',
			cls: 'publisher-btn-primary',
		});
		copyBtn.addEventListener('click', () => {
			const lh = themeVars['--pub-line-height'] ?? '1.75';
			const synced = this.html.replace(/\bline-height:\s*[\d.]+/g, `line-height: ${lh}`);
			copyRichText(synced)
				.then(() => {
					new Notice('✅ 已复制！请到公众号编辑器中粘贴。');
					this.close();
				})
				.catch(() => new Notice('❌ 复制失败，请检查浏览器权限。'));
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

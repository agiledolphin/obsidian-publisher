import { App, Modal, Notice } from 'obsidian';
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

		const pre = contentEl.createEl('pre');
		pre.style.cssText =
			'max-height: 60vh; overflow: auto; background: var(--background-secondary); ' +
			'padding: 12px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; word-break: break-all;';
		pre.textContent = this.html;

		const bar = contentEl.createDiv({ cls: 'publisher-preview-toolbar' });
		const copyBtn = bar.createEl('button', { text: '复制源码', cls: 'publisher-btn-primary' });
		copyBtn.addEventListener('click', async () => {
			await navigator.clipboard.writeText(this.html);
			new Notice('源码已复制');
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

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '公众号预览' });

		// Phone-width preview container
		const preview = contentEl.createDiv({ cls: 'publisher-preview-phone' });
		preview.innerHTML = this.html;

		// Toolbar — close on the left, actions on the right
		const toolbar = contentEl.createDiv({ cls: 'publisher-preview-toolbar' });

		const closeBtn = toolbar.createEl('button', {
			text: '关闭',
			cls: 'publisher-btn-secondary',
		});
		closeBtn.style.marginRight = 'auto';
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
			copyRichText(this.html)
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

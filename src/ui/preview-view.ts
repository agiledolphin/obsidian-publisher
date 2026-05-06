import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import type ObsidianPublisher from '../main';
import { readThemeVars, applyPreviewContent } from './preview-renderer';
import { copyRichText } from '../clipboard/writer';

export const VIEW_TYPE_PUBLISHER_PREVIEW = 'publisher-preview-view';

export class PublisherPreviewView extends ItemView {
	private currentFile: TFile | null = null;
	private previewEl!: HTMLElement;
	private currentHtml = '';

	constructor(leaf: WorkspaceLeaf, private plugin: ObsidianPublisher) {
		super(leaf);
	}

	getViewType(): string  { return VIEW_TYPE_PUBLISHER_PREVIEW; }
	getDisplayText(): string { return '公众号预览'; }
	getIcon(): string { return 'eye'; }

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('publisher-view-root');

		// ── Toolbar ─────────────────────────────────────────────────────
		const toolbar = root.createDiv({ cls: 'publisher-view-toolbar' });

		toolbar.createEl('button', {
			text: '关闭',
			cls: 'publisher-btn-secondary',
		}).addEventListener('click', () => this.leaf.detach());

		const refreshBtn = toolbar.createEl('button', {
			text: '刷新',
			cls: 'publisher-btn-secondary publisher-view-refresh-btn',
		});
		refreshBtn.addEventListener('click', () => {
			if (this.currentFile) void this.refresh(this.currentFile);
		});

		toolbar.createDiv({ cls: 'publisher-view-spacer' });

		const copyBtn = toolbar.createEl('button', {
			text: '复制到剪贴板',
			cls: 'publisher-btn-primary publisher-view-copy-btn',
		});
		copyBtn.addEventListener('click', () => {
			if (!this.currentHtml) return;
			const lh = readThemeVars()['--pub-line-height'] ?? '1.75';
			const synced = this.currentHtml.replace(/\bline-height:\s*[\d.]+/g, `line-height: ${lh}`);
			copyRichText(synced)
				.then(() => new Notice('✅ 已复制！请到公众号编辑器中粘贴。'))
				.catch(() => new Notice('❌ 复制失败，请检查浏览器权限。'));
		});

		// ── Preview area ─────────────────────────────────────────────────
		const scroll = root.createDiv({ cls: 'publisher-view-scroll' });
		this.previewEl = scroll.createDiv({ cls: 'publisher-preview-phone publisher-view-phone' });

		// ── Event listeners ──────────────────────────────────────────────
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				const file = this.app.workspace.getActiveFile();
				if (file instanceof TFile && file.extension === 'md' && file !== this.currentFile) {
					void this.refresh(file);
				}
			})
		);

		// Render immediately if a markdown file is already active
		const active = this.app.workspace.getActiveFile();
		if (active instanceof TFile && active.extension === 'md') {
			void this.refresh(active);
		}
	}

	async onClose(): Promise<void> { /* nothing to clean up */ }

	async refresh(file: TFile): Promise<void> {
		this.currentFile = file;
		this.previewEl.empty();
		this.previewEl.empty();

		try {
			const html = await this.plugin.controller.convert(file);
			this.currentHtml = html;
			applyPreviewContent(this.previewEl, html, readThemeVars());
		} catch (e) {
			this.currentHtml = '';
			this.previewEl.empty();
			this.previewEl.createEl('p', { text: `❌ 渲染失败：${(e as Error).message}` });
		}
	}
}

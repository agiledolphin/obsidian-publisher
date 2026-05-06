import { Plugin, Notice, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './settings';
import { ConvertController } from './convert-controller';
import { PublisherSettingTab } from './ui/settings-tab';
import { PreviewModal } from './ui/preview-modal';
import { PublisherPreviewView, VIEW_TYPE_PUBLISHER_PREVIEW } from './ui/preview-view';
import { logger } from './utils/logger';

export default class ObsidianPublisher extends Plugin {
	settings: PluginSettings;
	controller: ConvertController;

	async onload(): Promise<void> {
		await this.loadSettings();

		logger.setDebug(this.settings.debugMode);

		this.controller = new ConvertController(
			this.app.vault,
			this.app.metadataCache,
			this.settings
		);

		// ── Side-panel view ───────────────────────────────────────────
		this.registerView(
			VIEW_TYPE_PUBLISHER_PREVIEW,
			(leaf) => new PublisherPreviewView(leaf, this)
		);

		// ── Commands ──────────────────────────────────────────────────

		this.addCommand({
			id: 'copy-as-wechat',
			name: '复制为公众号格式',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.doConvertAndCopy(file);
				return true;
			},
		});

		this.addCommand({
			id: 'preview-wechat',
			name: '预览公众号效果（弹窗）',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.doPreview(file);
				return true;
			},
		});

		this.addCommand({
			id: 'open-preview-panel',
			name: '打开公众号预览面板',
			callback: () => void this.activatePreviewPanel(),
		});

		// ── Ribbon icon ───────────────────────────────────────────────
		this.addRibbonIcon('clipboard-copy', '复制为公众号格式', () => {
			const file = this.app.workspace.getActiveFile();
			if (file && file.extension === 'md') {
				void this.doConvertAndCopy(file);
			} else {
				new Notice('请先打开一个 Markdown 文件');
			}
		});

		// ── Context menu ──────────────────────────────────────────────
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) =>
						item
							.setTitle('复制为公众号格式')
							.setIcon('clipboard-copy')
							.onClick(() => this.doConvertAndCopy(file))
					);
					menu.addItem((item) =>
						item
							.setTitle('预览公众号效果')
							.setIcon('eye')
							.onClick(() => this.doPreview(file))
					);
					const panelOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_PUBLISHER_PREVIEW).length > 0;
					menu.addItem((item) =>
						item
							.setTitle(panelOpen ? '关闭预览面板' : '打开预览面板')
							.setIcon('layout-sidebar-right')
							.onClick(() => {
								if (panelOpen) {
									this.app.workspace.detachLeavesOfType(VIEW_TYPE_PUBLISHER_PREVIEW);
								} else {
									void this.activatePreviewPanel();
								}
							})
					);
				}
			})
		);

		// ── Settings tab ──────────────────────────────────────────────
		this.addSettingTab(new PublisherSettingTab(this.app, this));

		logger.info('Plugin loaded.');
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_PUBLISHER_PREVIEW);
		logger.info('Plugin unloaded.');
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.controller?.updateSettings(this.settings);
	}

	/** Opens the side-panel preview view, or focuses it if already open. */
	async activatePreviewPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PUBLISHER_PREVIEW);
		const existingLeaf = existing[0];
		if (existingLeaf) {
			this.app.workspace.revealLeaf(existingLeaf);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf('split');
		await leaf.setViewState({ type: VIEW_TYPE_PUBLISHER_PREVIEW, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async doConvertAndCopy(file: TFile): Promise<void> {
		try {
			await this.controller.convertAndCopy(file);
		} catch (e) {
			logger.error('Conversion failed:', e);
			new Notice(`❌ 转换失败：${(e as Error).message}`);
		}
	}

	private async doPreview(file: TFile): Promise<void> {
		try {
			const html = await this.controller.convert(file);
			new PreviewModal(this.app, html).open();
		} catch (e) {
			logger.error('Preview failed:', e);
			new Notice(`❌ 预览失败：${(e as Error).message}`);
		}
	}
}

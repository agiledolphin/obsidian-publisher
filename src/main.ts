import { Plugin, Notice, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, PluginSettings } from './settings';
import { ConvertController } from './convert-controller';
import { PublisherSettingTab } from './ui/settings-tab';
import { PreviewModal } from './ui/preview-modal';
import { logger } from './utils/logger';

export default class ObsidianPublisher extends Plugin {
	settings: PluginSettings;
	private controller: ConvertController;

	async onload(): Promise<void> {
		await this.loadSettings();

		logger.setDebug(this.settings.debugMode);

		this.controller = new ConvertController(
			this.app.vault,
			this.app.metadataCache,
			this.settings
		);

		// ── Commands ──────────────────────────────────────────────────

		// Copy current file as WeChat-compatible rich text
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

		// Preview converted result in a modal
		this.addCommand({
			id: 'preview-wechat',
			name: '预览公众号效果',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== 'md') return false;
				if (!checking) void this.doPreview(file);
				return true;
			},
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
				}
			})
		);

		// ── Settings tab ──────────────────────────────────────────────
		this.addSettingTab(new PublisherSettingTab(this.app, this));

		logger.info('Plugin loaded.');
	}

	onunload(): void {
		logger.info('Plugin unloaded.');
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<PluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.controller?.updateSettings(this.settings);
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

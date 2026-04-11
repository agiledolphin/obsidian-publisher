import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObsidianPublisher from '../main';

export class PublisherSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ObsidianPublisher) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('obsidian-publisher-settings');

		// ── 样式设置 ──────────────────────────────────────────────────
		new Setting(containerEl).setName('样式设置').setHeading();

		new Setting(containerEl)
			.setName('主题')
			.setDesc('选择公众号文章的显示主题。使用当前 Obsidian 主题时，会在转换时自动读取你 Obsidian 正在使用的主题颜色，支持所有社区主题。')
			.addDropdown((drop) =>
				drop
					.addOption('obsidian', '使用当前 Obsidian 主题（推荐）')
					.addOption('light', 'Obsidian light')
					.addOption('minimal', '简约')
					.setValue(this.plugin.settings.theme)
					.onChange(async (value) => {
						this.plugin.settings.theme = value as 'light' | 'minimal' | 'obsidian';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('自定义 CSS')
			.setDesc('在生成的 HTML 末尾追加自定义内联样式（高级用法）')
			.addTextArea((text) =>
				text
					.setPlaceholder('/* 暂未实现，保留字段 */')
					.setValue(this.plugin.settings.customCss)
					.onChange(async (value) => {
						this.plugin.settings.customCss = value;
						await this.plugin.saveSettings();
					})
			);

		// ── 图片设置 ──────────────────────────────────────────────────
		new Setting(containerEl).setName('图片设置').setHeading();

		new Setting(containerEl)
			.setName('图片处理方式')
			.setDesc(
				'base64：将本地图片嵌入 HTML（推荐，粘贴后微信可识别）；' +
				'跳过：保留原始路径（本地路径在公众号中无法显示）'
			)
			.addDropdown((drop) =>
				drop
					.addOption('base64', 'Base64 嵌入（推荐）')
					.addOption('skip', '跳过，保留原路径')
					.setValue(this.plugin.settings.imageMode)
					.onChange(async (value) => {
						this.plugin.settings.imageMode = value as 'base64' | 'skip';
						await this.plugin.saveSettings();
					})
			);

		// ── 转换选项 ──────────────────────────────────────────────────
		new Setting(containerEl).setName('转换选项').setHeading();

		new Setting(containerEl)
			.setName('移除 frontmatter')
			.setDesc('转换时去掉文档开头的 --- 元数据块')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.removeFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.removeFrontmatter = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('移除 #标签')
			.setDesc('转换时去掉正文中的 #tag 标签文本')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.removeTags)
					.onChange(async (value) => {
						this.plugin.settings.removeTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Wikilink 处理')
			.setDesc('[[链接]] 的处理方式')
			.addDropdown((drop) =>
				drop
					.addOption('text', '转为纯文本')
					.addOption('remove', '完全移除')
					.setValue(this.plugin.settings.wikiLinkMode)
					.onChange(async (value) => {
						this.plugin.settings.wikiLinkMode = value as 'text' | 'remove';
						await this.plugin.saveSettings();
					})
			);

		// ── 高级选项 ──────────────────────────────────────────────────
		new Setting(containerEl).setName('高级选项').setHeading();

		new Setting(containerEl)
			.setName('调试模式')
			.setDesc('在控制台输出转换过程的详细日志')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

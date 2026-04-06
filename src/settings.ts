export type ThemeName = 'light' | 'minimal' | 'obsidian';
export type ImageMode = 'base64' | 'skip';
export type WikiLinkMode = 'text' | 'remove';

export interface PluginSettings {
	theme: ThemeName;
	imageMode: ImageMode;
	wikiLinkMode: WikiLinkMode;
	removeFrontmatter: boolean;
	removeTags: boolean;
	debugMode: boolean;
	customCss: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	theme: 'light',
	imageMode: 'base64',
	wikiLinkMode: 'text',
	removeFrontmatter: true,
	removeTags: true,
	debugMode: false,
	customCss: '',
};

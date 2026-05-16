import { App, TFile, Vault, Notice, MetadataCache } from 'obsidian';
import { MarkdownParser } from './markdown/parser';
import { ImageEmbedder } from './image/embedder';
import { StyleEngine, readObsidianVars, ObsidianVars } from './style/engine';
import { copyRichText } from './clipboard/writer';
import { parseFrontmatter } from './markdown/frontmatter';
import { preprocessEmbeds, removeTags, processFootnotes, fixListTermination } from './markdown/preprocessor';
import { processMath } from './markdown/math';
import { processMermaid } from './markdown/mermaid';
import { logger } from './utils/logger';
import type { PluginSettings } from './settings';

export class ConvertController {
	private parser: MarkdownParser;
	private embedder: ImageEmbedder;
	private styleEngine: StyleEngine;

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private settings: PluginSettings
	) {
		this.parser      = new MarkdownParser();
		this.embedder    = new ImageEmbedder(vault);
		this.styleEngine = new StyleEngine(settings.theme);
	}

	/** Re-syncs mutable settings after user changes them in the settings tab. */
	updateSettings(settings: PluginSettings): void {
		this.settings = settings;
		this.styleEngine.setTheme(settings.theme);
		logger.setDebug(settings.debugMode);
	}

	/**
	 * Converts the file to styled HTML and copies it to the clipboard.
	 * Returns the HTML for optional further use (e.g. preview).
	 */
	async convertAndCopy(file: TFile): Promise<string> {
		const html = await this.convert(file);
		await copyRichText(html);
		new Notice('✅ 已复制到剪贴板！请到公众号编辑器中粘贴。');
		return html;
	}

	/** Converts a file to final styled HTML without clipboard side-effects. */
	async convert(file: TFile): Promise<string> {
		logger.debug('Starting conversion:', file.path);

		// 1. Read raw file content
		const raw = await this.vault.read(file);

		// 2. Strip frontmatter if enabled
		let markdown = raw;
		if (this.settings.removeFrontmatter) {
			markdown = parseFrontmatter(raw).body;
		}

		// 3. Pre-process Obsidian embeds: ![[image.png]] and ![[note.md]]
		markdown = await preprocessEmbeds(
			markdown,
			file.path,
			this.vault,
			this.metadataCache
		);

		// 4. Strip #tags if enabled (after embed expansion so embedded tags are also removed)
		if (this.settings.removeTags) {
			markdown = removeTags(markdown);
		}

		// 5. Render math: $$…$$ and $…$ → PNG <img> tags (via Obsidian's MathJax)
		markdown = await processMath(markdown);

		// 5b. Render Mermaid diagrams → PNG <img> tags (via Obsidian's built-in Mermaid)
		markdown = await processMermaid(markdown, this.app);

		// 6. Process footnotes: [^label] refs → superscripts, definitions → bottom section
		markdown = processFootnotes(markdown);

		// 6b. Ensure lists are terminated by a blank line before following content.
		// markdown-it applies CommonMark lazy-continuation which merges paragraphs
		// into the last list item; Obsidian does not — normalize here to match.
		markdown = fixListTermination(markdown);

		logger.debug('Preprocessed markdown, rendering HTML…');

		// 7. Markdown → HTML (inline styles applied by parser rules)
		let html = this.parser.render(markdown);

		logger.debug('HTML rendered, embedding images…');

		// 8. Embed local images as base64 data URLs
		if (this.settings.imageMode === 'base64') {
			const fileDir = file.parent?.path ?? '';
			html = await this.embedder.embedImages(html, fileDir);
		}

		logger.debug('Images embedded, applying style engine…');

		// 9. Apply theme overrides + WeChat sanitization + outer wrapper
		//    For 'obsidian' theme, read live CSS variables from the current theme.
		const vars: ObsidianVars | undefined =
			this.settings.theme === 'obsidian' ? readObsidianVars() : undefined;
		const finalHtml = this.styleEngine.process(html, vars);

		logger.debug('Conversion complete. HTML length:', finalHtml.length);
		return finalHtml;
	}
}

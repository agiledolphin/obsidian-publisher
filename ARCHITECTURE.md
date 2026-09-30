# Obsidian WeChat Publisher 插件架构设计文档

> **版本**：v7.0（对应插件 v0.6.0）
> **日期**：2026-09-30
> **目标平台**：微信公众号
> **开发策略**：分阶段交付——先实现转换与复制，再实现 API 发布

---

## 1. 项目概述

### 1.1 项目目标

开发一个 Obsidian 社区插件，将 Obsidian 的 Markdown 文档转换为微信公众号兼容的富文本 HTML，并支持一键复制到剪贴板。用户复制后，可直接粘贴到公众号编辑器中，保留排版样式。后续阶段再通过微信 API 实现自动化发布。

### 1.2 分阶段策略

| 阶段 | 目标 | 状态 |
|------|------|------|
| **阶段一** | 转换 + 复制 | ✅ **已完成并持续迭代（当前 v0.6.0）** |
| **阶段二** | API 自动发布（草稿上传） | 待开始 |

**阶段一的优势**：
- 零配置即可使用，无需 AppID/AppSecret
- 无需处理 IP 白名单、Token 管理等复杂逻辑
- 用户可以在粘贴后手动微调排版
- 图片通过公众号编辑器自动上传，无需调用素材 API

---

## 2. Obsidian 插件开发基础

> 本章为零基础入门参考，帮助理解后续架构设计的技术约束。

### 2.1 插件结构

一个 Obsidian 插件本质上是一个 npm 项目，最终需要将所有代码打包为单个 `main.js` 文件。发布时需要三个文件：

| 文件 | 用途 |
|------|------|
| `main.js` | 插件入口，所有代码打包后的产物 |
| `manifest.json` | 插件元信息（名称、版本、最低 Obsidian 版本等） |
| `styles.css` | 插件自身 UI 的样式（可选） |

插件代码使用 TypeScript 编写，通过 esbuild 打包。

### 2.2 核心 API

Obsidian 通过 `this.app` 暴露核心接口：

- **`Vault`**：读写 vault 中的文件和文件夹。通过 `vault.read(file)` 获取文件内容，`vault.readBinary(file)` 读取二进制文件（图片）。
- **`Workspace`**：管理编辑器面板。通过 `workspace.getActiveFile()` 获取当前打开的文件。
- **`MetadataCache`**：缓存的 Markdown 元数据，提供 `getFirstLinkpathDest(linkpath, sourcePath)` 用于解析 Obsidian 风格的链接（支持短路径、无扩展名等）。
- **`Plugin`** 基类：提供 `loadData()` / `saveData()` 用于持久化插件配置，`addCommand()` 注册命令，`addSettingTab()` 注册设置页面。

### 2.3 插件生命周期

```
onload()    → 插件启用时调用，注册命令、事件、设置页
onunload()  → 插件禁用时调用，清理资源
```

---

## 3. 微信公众号 HTML/CSS 约束分析

> 这是整个项目最重要的技术背景。微信公众号编辑器对 HTML 有严格的白名单过滤机制，是我们所有设计决策的基础约束。

### 3.1 会被过滤掉的内容

| 内容 | 说明 |
|------|------|
| `<style>` 标签 | 完全移除，只能用内联 style 属性 |
| `<script>` 标签 | 完全移除，不支持任何 JS |
| `class` 属性 | 被移除 |
| `id` 属性 | 被移除 |
| `position` 属性 | CSS 定位完全失效 |
| `<iframe>` 标签 | 不支持 |
| 外部样式表 | 不支持 |
| CSS 伪类 | `:hover`、`:focus` 等不支持 |
| CSS 动画 | `@keyframes`、`transition` 不支持 |

### 3.2 支持的 HTML 标签

`<p>`、`<h1>`~`<h6>`、`<strong>`/`<b>`、`<em>`/`<i>`、`<u>`、`<br>`、`<hr>`、`<img>`、`<a>`、`<table>`/`<tr>`/`<td>`/`<th>`、`<ul>`/`<ol>`/`<li>`、`<blockquote>`、`<pre>`/`<code>`、`<span>`、`<div>`/`<section>`、`<sub>`/`<sup>`、`<mark>`、`<del>`

### 3.3 富文本粘贴机制

微信公众号编辑器支持从网页复制富文本粘贴。当剪贴板中包含 `text/html` 格式的数据时，粘贴到公众号编辑器会保留内联样式的格式信息。

**这是阶段一的核心交互方式**：我们将带有内联样式的 HTML 写入剪贴板的 `text/html` 格式，用户粘贴到公众号编辑器即可保留样式。

---

## 4. 核心架构设计（阶段一：转换与复制）

### 4.1 整体架构图

```
┌────────────────────────────────────────────────────────────┐
│                    Obsidian Plugin Layer                    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Commands │  │ Settings Tab │  │ Ribbon / Notice       │  │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘  │
│       │               │                     │              │
│  ┌────▼───────────────▼─────────────────────▼───────────┐  │
│  │               ConvertController                       │  │
│  │         （转换流程编排 / 错误处理）                      │  │
│  └──┬──────────┬──────────────┬──────────────┬──────────┘  │
│     │          │              │              │             │
│  ┌──▼──────┐  ┌▼──────────┐  ┌▼───────────┐  ┌▼─────────┐  │
│  │ Markdown│  │ Image     │  │ Style      │  │Clipboard │  │
│  │ Parser  │  │ Embedder  │  │ Engine     │  │ Writer   │  │
│  └──┬──────┘  └────┬──────┘  └─────┬──────┘  └──────────┘  │
│     │              │               │                        │
│  preprocessor   base64 encode  theme overrides +            │
│  + plugins      via vault      WeChat sanitize              │
└────────────────────────────────────────────────────────────┘
```

### 4.2 转换流程

```typescript
// ConvertController.convert(file)
1.  vault.read(file)                         // 读取原始文件
2.  parseFrontmatter(raw).body               // 移除 frontmatter（可配置）
3.  preprocessEmbeds(markdown, ...)          // 展开 ![[image]] 和 ![[note.md]]
4.  removeTags(markdown)                     // 移除 #tag（可配置）
5.  processMath(markdown)                    // LaTeX → PNG <img>（MathJax + html2canvas）
6.  processMermaid(markdown, app)            // Mermaid 图 → PNG <img>（MarkdownRenderer + Canvas）
7.  processFootnotes(markdown)               // 脚注转上标 + 底部引用区
8.  markdownParser.render(markdown)          // markdown-it → 带内联样式的 HTML
9.  imageEmbedder.embedImages(html, ...)     // 本地图片 → base64 data URL
10. styleEngine.process(html, vars)          // 主题覆盖 + WeChat 清理 + 外层 div
```

### 4.3 模块详细设计

#### 模块 1：Preprocessor（预处理器）

**文件**：`src/markdown/preprocessor.ts`

**职责**：在 markdown-it 解析前处理 Obsidian 特有语法，包括嵌入文件展开、标签移除、脚注处理。

**关键函数**：

| 函数 | 说明 |
|------|------|
| `preprocessEmbeds()` | 展开 `![[image.png]]` 和 `![[note.md]]`，使用 MetadataCache 解析链接路径 |
| `removeTags()` | 移除 `#tag` 标签，保留代码块和标题内的标签 |
| `processFootnotes()` | 将 `[^label]` 脚注转为微信兼容格式（上标引用 + 底部定义区，无锚链接） |

**设计要点**：

- 图片嵌入直接生成 `<img>` HTML 标签，而非 markdown 语法，以避免文件名含空格时 markdown-it 进行 URL 编码导致路径失效
- note 展开使用 `replace(full, () => content)` 函数形式，防止内容中的 `$` 字符被 String.replace 解释为反向引用
- 递归嵌入最大深度为 3 层，超出时记录警告

```typescript
// 图片 embed → 直接 <img> 标签（而非 markdown 语法）
const resolvedFile = metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
const resolvedSrc  = resolvedFile instanceof TFile ? resolvedFile.path : cleanPath;
const imgTag = `<img src="${escapedSrc}" alt="${escapedAlt}" style="...">`;
result = result.replace(full, () => imgTag);

// note embed → 内联展开
const noteContent = await vault.read(resolvedFile);
const { body } = parseFrontmatter(noteContent);
const expanded  = await preprocessEmbeds(body, resolvedFile.path, vault, metadataCache, depth + 1);
result = result.replace(full, () => `\n\n${expanded}\n\n`);
```

#### 模块 2：MarkdownParser（Markdown 解析器）

**文件**：`src/markdown/parser.ts`

**职责**：使用 markdown-it 将 Markdown 转换为带内联样式的 HTML。所有样式直接内联（不使用 `juice` 库），通过 renderer rules 和自定义插件实现。

**markdown-it 配置**：

```typescript
new MarkdownIt({
  html: true,      // 允许原始 HTML（preprocessor 输出的 <img> 标签）
  linkify: true,   // 自动识别 URL
  typographer: false,
  highlight: (str, lang) => { /* highlight.js + 内联主题样式 */ }
})
```

**注册的插件**：

| 插件 | 文件 | 功能 |
|------|------|------|
| `obsidianCalloutPlugin` | `plugins/callout.ts` | `> [!type]` → 带样式 section；`obsidian` 主题下颜色/图标通过 `--callout-color` / `--callout-icon` CSS 变量跟随主题（`normalizeRgbTriplet` 兼容 "r,g,b" 和十六进制两种取值格式），静态主题下走 `setCalloutTheme()` 注入的固定色板；图标用 Lucide SVG（`getIcon()`）；普通 `>` → blockquote（accent 竖线） |
| `obsidianWikiLinkPlugin` | `plugins/wikilink.ts` | `[[link]]` → 灰色 `<span>`（muted 色，不可点击） |
| `obsidianHighlightPlugin` | `plugins/highlight-mark.ts` | `==text==` → `<mark>` |
| `obsidianStrikethroughPlugin` | `plugins/strikethrough.ts` | `~~text~~` → `<del>` |
| `obsidianTaskListPlugin` | `plugins/task-list.ts` | 7 种任务状态（`[ ]` / `[x]` / `[/]` / `[-]` / `[>]` / `[?]` / `[!]`）→ 带图标列表项 |

所有插件共享 `src/markdown/plugins/utils.ts` 中的 `splitTokensByRegex()` 辅助函数，用于在内联 token 流中进行正则切割。

**代码高亮**：使用 `highlight.js` 静态内联语法颜色（GitHub Light 配色），通过 `applyHljsTheme()` 将 class 名直接替换为 `style` 属性，避免输出任何 `class` 属性。

**支持的代码语言**：JavaScript / TypeScript、Python、Java、Go、Rust、C++、CSS、HTML/XML、Bash、SQL、JSON、YAML、plaintext

#### 模块 3：ImageEmbedder（图片嵌入器）

**文件**：`src/image/embedder.ts`

**职责**：扫描 HTML 中的本地图片路径（由 preprocessor 生成的 vault 相对路径），通过 `vault.readBinary()` 读取二进制内容，转换为 `data:image/...;base64,...` data URL。

**解析策略**（按优先级）：
1. 精确路径匹配（vault 绝对路径）
2. 相对于当前文档的路径
3. 按文件名在 vault 全局搜索（发现多个同名文件时记录警告，推荐使用完整路径）

#### 模块 4：StyleEngine + 主题注册表（样式引擎 / Theme Registry）

**文件**：`src/style/engine.ts`（引擎）、`src/style/themes.ts`（静态主题注册表）、`src/style/color-utils.ts`（颜色工具）

**职责**：将基于亮色主题硬编码的 HTML 中的颜色/样式，根据当前发布主题配置进行替换（字符串 regex 批量替换），然后做 WeChat 兼容性清理，最后包装外层 `<div>` 容器。

> **"发布主题"与 Obsidian 主题的区别**：这里的"主题"是 obsidian-publisher 插件自己的发布样式（转换成公众号文章后长什么样），跟 Obsidian 编辑器本身用的社区主题是两个独立概念。前者由 `PluginSettings.theme` 决定，后者是 Obsidian 应用设置，二者只在 `obsidian` 这一个选项上产生联系（见下）。

**两大主题模式**：

| 模式 | 说明 |
|------|------|
| `obsidian` | 默认选项。转换时通过 `readObsidianVars()` 实时读取当前激活的 Obsidian 主题 CSS 变量，预览效果始终跟随用户正在使用的 Obsidian 主题 |
| 静态预设主题（9 款） | 完全独立于 Obsidian 主题的固定配色方案，见下表。每次转换都渲染出同样的效果，不受用户切换 Obsidian 主题影响 |

**9 款静态预设主题**（`src/style/themes.ts` 的 `STATIC_THEMES` / `STATIC_THEME_LIST`）：

| id | 名称 | 定位 |
|----|------|------|
| `catppuccin-latte` | 马卡龙紫 | 柔和马卡龙紫色调，生活方式、读书笔记、文艺随笔 |
| `minimal-mono` | 简约黑白 | 米白底 + 灰阶标题层级，通用长文阅读排版 |
| `warm-almond` | 护眼杏仁 | 暖米黄底 + 棕褐正文，长文阅读、减少眼疲劳 |
| `tech-blue` | 科技蓝 | 冷白/浅灰底 + 靛蓝强调色，科技/商业/金融类账号 |
| `china-red` | 中国红 | 暖白底 + 朱红+金强调色，文化/历史/时评类账号 |
| `forest-green` | 森系绿 | 清新鼠尾草绿，健康/教育/成长类账号 |
| `sakura-pink` | 樱语粉 | 柔和樱花粉，情感/生活方式/女性向账号 |
| `graphite-dark` | 深空灰 | **首款暗色背景主题**，科技数码、深夜阅读 |
| `orange-heart` | 橙心 | 参考"墨滴"同名主题：珊瑚橙 + 墨绿双色，H2 采用色块横幅（`headingBanner`），见下 |

**`StaticTheme` 接口**（`themes.ts`）统一描述一款静态主题的全部色值：`bgPrimary`/`textNormal`/`textMuted`/`textFaint`/`textItalic`/`linkColor`/`accent`/`headings`（H1–H6 六色）/`highlightBg`/`codeBackground`/`borderColor`/`code`（10 个语法高亮 token 色）/`calloutAccent`（13 种 callout 类型强调色）。新增一款主题只需要在 `themes.ts` 里补一份这样的配置对象，`buildStaticThemeMap()` 会自动生成对应的 regex 替换表，其余模块（`callout.ts`/`mermaid.ts`/`math.ts`）都通过 `getStaticTheme(themeId)` 统一查表，不需要逐个文件加 if/else。

**两个可选扩展字段**（目前只有橙心用到）：

- `headingBanner?: { level: 1 | 2; textColor: string; flagColor?: string }`：把指定层级标题从纯色文字换成"色块横幅"——内层 `<span>` 徽标（`display:inline-block`，紧贴文字宽度）+ 外层 `<h2>` 撑满宽度画 `border-bottom` 通栏细线（`display:flex; align-items:stretch`）。若配置了 `flagColor`，徽标右侧会再拼一个三角旗：一个空 `<span>`，把 SVG data URI（`viewBox` 多边形）当**背景图**（`background-image` + `background-size: 100% 100%`），而不是 `<img>` 内容、CSS `clip-path`（会被微信粘贴过滤器剥离）或纯 border 三角形（固定像素高度，标题换行时对不上徽标实际高度）。**踩过的坑**：一度试过把 SVG 用 `<img>` 呈现，结果 `<img>` 自带的 `viewBox` 宽高比（20:100）被浏览器当成"内在尺寸"参与 flex 布局的高度计算，`align-items:stretch` 反而把徽标拉伸到匹配这个虚高的图片高度，导致单行标题也变成一个大方块；换成空 `<span>` + `background-image` 后，背景图完全不参与盒子尺寸计算，`span` 的高度只由 `align-self:stretch` 决定（即跟随徽标的真实高度，包括标题换行成多行的情况），`background-size:100% 100%` 再把三角形拉伸填满这个高度。
- `boldColor?: string`：覆盖 `**粗体**` 的颜色，默认继承正文色。选色时要避开该主题里标题/callout 已经占用的强调色，避免视觉撞色（例如橙心最终选了主强调色珊瑚橙 `#DF7766`，贯穿粗体/链接/H2/Note callout 这一条"品牌色"线）。

**颜色计算工具**（`color-utils.ts`）：

- `mixColors(hex1, hex2, fraction)`：两色混合，callout 背景色统一用 `mixColors(bgPrimary, calloutAccent, 0.1)` 算出（10% 强调色混入底色），不用为每个类型手工挑背景色
- `hexToRgbTriplet(hex)`：hex → `"r, g, b"` 字符串，供 callout 图标 SVG stroke 使用
- `normalizeRgbTriplet(raw, fallback)`：把 `--callout-color` 读到的值统一成 `"r, g, b"`——见下方 8.8 的踩坑记录，同时兼容 Obsidian 官方约定的 "r, g, b" 格式和部分主题（如 Minimal 的 Flexoki 配色）实际使用的十六进制格式

#### 模块 2b：MermaidProcessor（Mermaid 渲染器）

**文件**：`src/markdown/mermaid.ts`

**职责**：将 ` ```mermaid ``` ` 代码块渲染为 PNG `<img>` 标签，使用 Obsidian 内置 Mermaid 引擎（无需额外打包 Mermaid.js）。

**核心流程**：

1. 正则提取所有 mermaid 块，替换为 `\x00MERMAIDn\x00` 占位符
2. 创建带 `.markdown-preview-view` class 的 offscreen wrapper（触发 Obsidian Mermaid 后处理器）
3. 用 `MarkdownRenderer.render()` 渲染含 `%%{init}%%` 指令的 mermaid 块，等待 SVG 出现（`waitForSvg` MutationObserver，5s 超时）
4. `svgToPng()`：从 **live SVG**（仍在正确 CSS 上下文中）读取 computed styles → 写入 **clone**（clone 无 observer，setAttribute 安全）→ `cleanSvgEl()` 清理 → Blob URL → `<img>` → Canvas 2x → PNG data URL
5. 替换占位符为 `<img>` 标签；失败时 fallback 为样式化文本块

**关键技术决策**：

| 问题 | 解决方案 |
|------|----------|
| Canvas taint（@font-face / var() / foreignObject） | `cleanSvgEl()` 删除所有 `<style>`，替换 `<foreignObject>` 为 `<text>`，移除外部 href |
| MutationObserver crash（`eA.slice is not a function`） | 从 live SVG **读** computed styles（无 mutation），写到 **clone**（无 observer） |
| 深色/浅色主题颜色（`obsidian` 主题） | init 指令根据 `document.body.classList.contains('theme-dark')` 选择 Mermaid `"dark"` 或 `"default"` 内置主题 |
| 静态主题配色 | `themes.ts` 的 `buildMermaidInit(theme)` 用该主题自己的 `accent`/`calloutAccent` 等色值生成 `"theme":"base"` + `themeVariables` 指令，让流程图/饼图配色跟主题其余部分保持一致，而不是套用 Mermaid 内置的深/浅色配色 |
| Mermaid 后处理器不触发 | 始终创建带 `.markdown-preview-view` class 的 wrapper，不依赖现有面板是否打开 |
| 复制按钮图标 SVG 干扰 | `findMermaidSvg()` 优先 `.mermaid svg` / `.block-language-mermaid svg`；fallback 按 width/height 属性（≤32px）和子元素数量（>5）区分图标与真实图表 |
| 预览面板 `sanitizeHTMLToDom` 剥离 data URL | `applyPreviewContent()` 先将 `data:` URL 暂存并替换为 `data-pub-src` 索引，sanitize 后再通过 `.src` property 赋值还原（property 写入绕过 sanitizer） |

**Mermaid init 指令**：

```
%%{init: {"theme":"dark","flowchart":{"htmlLabels":false}}}%%
```

- `theme`：根据 Obsidian 深/浅色模式动态选择，Mermaid 直接生成正确配色（Obsidian 通过 CSS 覆盖应用深色样式，但 CSS 规则无法覆盖 Mermaid 自己设置的 inline style）
- `htmlLabels:false`：flowchart 节点标签用 SVG `<text>` 而非 `<foreignObject>`，防止 Chromium canvas 安全策略导致的 taint

---

**Obsidian 主题变量读取**（`readObsidianVars()`）：

Obsidian 主题使用深度嵌套的 CSS 变量（如 `--background-primary: var(--color-base-00)`），`getPropertyValue()` 只返回原始字符串而非计算值。解决方案：注入临时 DOM 元素，通过 `getComputedStyle()` 获取浏览器解析后的实际值。

```typescript
// withEl: 通用的临时元素注入 + 自动清理（try/finally 保证安全）
function withEl<T>(cssText: string, read: (el: HTMLDivElement) => T): T {
  const el = document.createElement('div');
  el.style.cssText = cssText;
  document.body.appendChild(el);
  try { return read(el); }
  finally { document.body.removeChild(el); }
}

// 示例：读取背景色（正确解析 var() 嵌套链）
readComputedBg('--background-primary', '#ffffff')
// → withEl('background-color: var(--background-primary); ...', el => cssColorToHex(getComputedStyle(el).backgroundColor))
```

读取的变量包括：背景色、文字颜色（normal / muted / faint）、强调色、链接色、字体、各级标题色（H1–H6 独立读取 `--h1-color` … `--h6-color`）、代码块背景、内联代码色、callout 配色（通过 `--callout-color` 读取每种类型的 RGB 值）、高亮背景色、斜体颜色。

任务列表的 checkbox 形状、边框宽度、完成态颜色**不再**从主题读取——任务列表采用公众号自有风格，样式固定，与 Obsidian 主题解耦。

**代码语法配色方案**：

使用两套静态配色，根据 `document.body.classList.contains('theme-dark')` 选择：
- 亮色：Tokyo Night Day
- 暗色：Tokyo Night Storm

`applyObsidianOverrides` 将 parser 输出的 GitHub Light 颜色逐一替换为当前主题对应的颜色。

**WeChat 兼容性清理**（`src/style/sanitizer.ts`）：

```typescript
// 移除微信不支持的属性
html.replace(/position\s*:\s*\w+\s*;?/gi, '')
html.replace(/\s+class="[^"]*"/gi, '')
html.replace(/\s+id="[^"]*"/gi, '')
html.replace(/\s+data-\w+(?:-\w+)*="[^"]*"/gi, '')
html.replace(/\s+style=""/gi, '')
```

#### 模块 5：ClipboardWriter（剪贴板写入器）

**文件**：`src/clipboard/writer.ts`

**职责**：将最终 HTML 以富文本格式写入系统剪贴板。

**实现**：使用 `ClipboardItem` API（现代浏览器标准）：

```typescript
async function copyRichText(html: string): Promise<void> {
  const blob = new Blob([html], { type: 'text/html' });
  await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
}
```

相比 `document.execCommand('copy')` 方案，`ClipboardItem` 更直接、更标准，不依赖 DOM 选区，在 Obsidian（Electron）环境中可靠工作。

#### 模块 6：ConvertController（转换流程控制器）

**文件**：`src/convert-controller.ts`

**职责**：编排整个转换流程，持有各模块实例，暴露 `convert()` 和 `convertAndCopy()` 两个入口。

---

## 5. 用户界面设计（阶段一）

### 5.1 插件设置

**文件**：`src/settings.ts`、`src/ui/settings-tab.ts`

**可配置项**：

| 设置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `theme` | `string`（`'obsidian'` 或 `themes.ts` 注册表里任一静态主题 id） | `'obsidian'` | 发布主题；旧版保存的 `'light'` 会在插件加载时自动迁移为 `'catppuccin-latte'`（`LEGACY_THEME_ALIASES`） |
| `imageMode` | `'base64' \| 'skip'` | `'base64'` | 本地图片处理方式 |
| `wikiLinkMode` | `'text' \| 'remove'` | `'text'` | WikiLink 处理方式 |
| `removeFrontmatter` | `boolean` | `true` | 是否移除 frontmatter |
| `removeTags` | `boolean` | `true` | 是否移除 #tag |
| `debugMode` | `boolean` | `false` | 是否输出调试日志 |
| `customCss` | `string` | `''` | 自定义 CSS（保留字段，待实现） |

### 5.2 命令注册

| 命令 | 说明 |
|------|------|
| 复制为公众号格式 | 转换当前文档并复制到剪贴板 |
| 预览公众号效果 | 弹窗预览转换后的 HTML 效果 |

还注册了左侧 Ribbon 图标（剪贴板图标）触发复制命令，以及文件右键菜单项。

### 5.3 预览弹窗

**文件**：`src/ui/preview-modal.ts`

模拟手机宽度（375px）预览效果，支持预览后点击"复制"按钮写入剪贴板。预览容器设置 `overflow-x: hidden` 和 `box-sizing: border-box` 防止宽图溢出。标题栏（h2）支持鼠标拖拽移动弹窗位置（mousedown 时从 flex 居中转为 fixed 定位，drag 期间实时更新 left/top）。

弹窗持有 `plugin` + `file`（而非外部预先转换好的 HTML 字符串），`onOpen()` 内部自行调用 `plugin.controller.convert(file)`；工具栏内置一个主题下拉框（`THEME_OPTIONS`，来自 `themes.ts`），切换主题时更新 `plugin.settings.theme` → `saveSettings()` → 重新调用 `renderContent()` 整体重转换，不需要关闭弹窗重新打开就能比较不同主题效果。

### 5.4 右侧预览面板

**文件**：`src/ui/preview-view.ts`

`PublisherPreviewView extends ItemView`，注册 view type `publisher-preview-view`，在右侧分栏展示微信预览效果，与 Obsidian 工作区原生分栏布局融合。

**行为**：
- 切换到另一个 `.md` 文件时（`active-leaf-change`）自动触发重新渲染
- 工具栏提供「关闭」「刷新」主题下拉框「复制到剪贴板」，切主题后自动重新转换刷新
- 预览内容限宽 375px 居中，超出高度可滚动
- 插件卸载时自动关闭（`detachLeavesOfType`）

**渲染复用**：`readThemeVars()` 和 `applyPreviewContent()` 抽取到 `src/ui/preview-renderer.ts`，弹窗和面板共用。

**窄屏工具栏换行**：侧边栏可以拖得很窄，工具栏（关闭/刷新/主题下拉框/复制到剪贴板）在窄宽度下原先会整体溢出容器右边被裁切。`styles.css` 给 `.publisher-view-toolbar` 加了 `flex-wrap: wrap`，下拉框限制 `max-width`，按钮收窄 padding；装不下时自动换成两行，不再裁切。

---

## 6. 项目文件结构

```
obsidian-publisher/
├── src/
│   ├── main.ts                        # 插件入口，注册命令/Ribbon/设置页
│   ├── convert-controller.ts          # 转换流程编排
│   ├── settings.ts                    # 设置类型定义与默认值
│   ├── markdown/
│   │   ├── parser.ts                  # markdown-it 解析核心（内联样式输出）
│   │   ├── preprocessor.ts            # ![[embed]] 展开、#tag 移除、脚注处理
│   │   ├── frontmatter.ts             # Frontmatter 解析与移除
│   │   ├── math.ts                    # LaTeX → PNG（MathJax CHTML + html2canvas，iframe 隔离批量渲染）
│   │   ├── mermaid.ts                 # Mermaid 图 → PNG（MarkdownRenderer offscreen + Canvas）
│   │   └── plugins/
│   │       ├── utils.ts               # splitTokensByRegex 通用工具
│   │       ├── callout.ts             # > [!type] Callout 语法
│   │       ├── wikilink.ts            # [[link]] → 纯文本
│   │       ├── highlight-mark.ts      # ==高亮== → <mark>
│   │       ├── strikethrough.ts       # ~~删除线~~ → <del>
│   │       └── task-list.ts           # - [ ] / - [x] 任务列表
│   ├── image/
│   │   └── embedder.ts                # 本地图片 → base64 data URL
│   ├── style/
│   │   ├── engine.ts                  # StyleEngine：主题覆盖分发 + Obsidian CSS 变量读取
│   │   ├── themes.ts                  # 静态主题注册表（9 款预设）+ 主题色值→regex 替换表生成
│   │   ├── color-utils.ts             # mixColors / hexToRgbTriplet / normalizeRgbTriplet
│   │   └── sanitizer.ts               # 微信兼容性清理（移除 position/class/id 等）
│   ├── clipboard/
│   │   └── writer.ts                  # ClipboardItem API 写入富文本
│   ├── ui/
│   │   ├── settings-tab.ts            # 设置页面
│   │   ├── preview-modal.ts           # 预览弹窗（可拖拽）
│   │   ├── preview-view.ts            # 右侧预览面板（ItemView）
│   │   └── preview-renderer.ts        # 共享：readThemeVars + applyPreviewContent
│   └── utils/
│       ├── logger.ts                  # 调试日志（受 debugMode 控制）
│       └── mime.ts                    # 文件扩展名 → MIME 类型
├── styles.css                         # 插件 UI 样式（预览弹窗等）
├── manifest.json                      # 版本 0.6.0
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── README.md
```

---

## 7. 数据流详解

```
原始 Markdown（含 Obsidian 扩展语法）
        │
        ▼
┌─── Frontmatter 提取 ──────┐
│  移除 frontmatter 块        │
└────────────────────────────┘
        │
        ▼ (纯 Markdown body)
┌─── preprocessor ──────────┐
│  ![[image.png]] → <img>   │  ← MetadataCache 解析路径
│  ![[note.md]]  → 内联展开  │  ← 递归，最大深度 3
│  #tag          → 移除      │
└────────────────────────────┘
        │
        ▼
┌─── processMath ───────────┐
│  $...$ / $$...$$ → PNG    │  ← MathJax + html2canvas iframe
└────────────────────────────┘
        │
        ▼
┌─── processMermaid ────────┐
│  ```mermaid → PNG <img>   │  ← MarkdownRenderer offscreen + Canvas
└────────────────────────────┘
        │
        ▼
┌─── processFootnotes ──────┐
│  [^label]      → 上标引用  │
│                + 底部脚注区│
└────────────────────────────┘
        │
        ▼ (预处理后的 Markdown，含原始 <img> HTML)
┌─── markdown-it 解析 ──────┐
│  标准 MD → 带内联样式 HTML  │
│  highlight.js 代码高亮     │  ← class 替换为 inline style
│  + Obsidian 语法插件:      │
│    callout / wikilink /    │
│    highlight / strikethrough│
│    / task-list             │
└────────────────────────────┘
        │
        ▼ (带内联样式的 HTML，图片为 vault 路径)
┌─── ImageEmbedder ─────────┐
│  扫描所有 <img> src         │
│  本地路径 → base64 data URL │  ← vault.readBinary()
│  外部 URL → 保持原样        │
└────────────────────────────┘
        │
        ▼ (图片已 base64 的 HTML)
┌─── StyleEngine ───────────┐
│  obsidian 主题：读取实时     │  ← readObsidianVars()
│  Obsidian CSS 变量         │
│  静态主题：查 themes.ts      │  ← getStaticTheme(id)
│  注册表取固定色值            │
│  批量替换颜色/样式          │  ← regex 字符串替换
│  WeChat 兼容性清理         │  ← 移除 position/class/id
│  包装 <div> 外层容器        │
└────────────────────────────┘
        │
        ▼ (最终清洁 HTML)
┌─── ClipboardWriter ───────┐
│  ClipboardItem API        │
│  → 系统剪贴板 (text/html)  │
└────────────────────────────┘
        │
        ▼
用户在公众号编辑器中 Ctrl+V 粘贴
```

---

## 8. 关键技术方案与实现细节

### 8.1 内联样式策略（无 juice 库）

不使用 `juice` 做 CSS 内联，而是**在 markdown-it renderer rules 中直接输出带 `style` 属性的 HTML**。

优点：
- 零运行时依赖（juice 约 20KB）
- 完全控制每个元素的输出格式
- 与 `StyleEngine` 的字符串替换方案完美配合

注意：样式分散在各 renderer rule 中，修改样式时须与 `engine.ts` 的替换表保持同步（hardcoded 颜色值是两者之间的契约）。

### 8.2 CSS 变量解析（element injection）

Obsidian 主题使用深度嵌套变量，`getPropertyValue()` 返回原始字符串（如 `var(--color-base-00)`）而非计算值。

解决方案：将变量应用为 CSS 属性（`color: var(--foo)`），注入临时 DOM 元素，通过 `getComputedStyle()` 获取浏览器解析后的真实值。所有这类操作封装在 `withEl()` 中，用 `try/finally` 保证即使异常也能清理 DOM。

特殊情况：高亮色同时读取 computed `backgroundColor`（`textHighlightBg`）和 `color`（`textHighlightFg`），以捕获 Blue Topaz 等主题直接写 `mark {}` 规则（而非走 CSS 变量）的情况，确保高亮文字颜色也能跟随主题。

### 8.3 代码高亮颜色

Parser 输出 GitHub Light 配色（hardcoded 颜色值）。StyleEngine 的 `applyObsidianOverrides` 将这些颜色替换为两套 Tokyo Night 配色（Day/Storm），具体选哪套由 `document.body.classList.contains('theme-dark')` 决定。

### 8.4 图片路径含空格

markdown-it 渲染 `![alt](path with spaces)` 时会 URL 编码空格，导致 `vault.getAbstractFileByPath()` 找不到文件。

解决方案：`preprocessor.ts` 直接生成 `<img src="..." style="...">` HTML 标签（而非 markdown 语法），markdown-it 的 `html: true` 选项将其透传，图片规则不再触发 URL 编码。

### 8.5 同名文件消歧

按文件名全局搜索时，如果找到多个同名文件，`embedder.ts` 记录警告并跳过（不随机选一个），提示用户在 `![[]]` 中使用完整相对路径。

### 8.6 任务列表实现

使用 flex 布局：左侧固定宽度图标（`flex-shrink: 0`）+ 右侧 `flex: 1` 内容区。支持 7 种任务状态，均为公众号自有固定样式，不跟随 Obsidian 主题：

| 状态 | 图标 | 颜色 | 内容样式 |
|------|------|------|----------|
| `[ ]` | 空框 | 灰色边框 | 正常 |
| `[x]` | ✓ | accent 紫 | 灰色 + 删除线 |
| `[/]` | / | 蓝色 | 正常 |
| `[-]` | – | 灰色 | 灰色 + 删除线 |
| `[>]` | › | 琥珀色 | 正常 |
| `[?]` | ? | 黄色 | 正常 |
| `[!]` | ! | 红色 | 正常 |

`insideDoneTask` 状态变量控制 `done` 和 `cancelled` 两种状态下段落渲染规则（灰色 + 删除线）。`task-list.ts` 使用 `taskPatterns` 数组按序匹配，命中后写入 `data-task` 属性，`parser.ts` 的 `list_item_open` renderer 根据该属性分支渲染。

### 8.7 String.replace 特殊字符

note 展开时，嵌入内容中的 `$&`、`$'`、`$`` 等字符会被 `String.replace(pattern, replacement)` 解释为替换模式引用，导致输出损坏。解决方案：始终使用函数形式 `replace(pattern, () => content)` ，函数返回值被原样使用，不做特殊字符解释。

### 8.8 Callout 颜色格式兼容（`--callout-color` 不一定是 "r, g, b"）

`readCalloutStyle()` 原先假设所有主题的 `--callout-color` 都遵循 Obsidian 官方约定的 `"r, g, b"` 格式（如 `"68, 138, 255"`），直接拼成 `rgb(${rgb})` 使用。但 Minimal 主题的 Flexoki 配色把它定义成了十六进制（如 `#205EA6`），拼出来变成非法 CSS `rgb(#205EA6)`，导致该值被浏览器整体忽略——callout 图标消失、标题文字掉色、背景不显示，三个症状同时出现且看起来互不相关，容易误判成三个独立 bug。

解决方案：`color-utils.ts` 的 `normalizeRgbTriplet(raw, fallback)` 同时识别两种格式，统一转成 `"r, g, b"` 再使用。

### 8.9 表格：表头背景/文字色/边框色/列对齐

**表头背景色**：`readTableHeaderVars()`（`engine.ts`）不能只读 `--table-header-background` 这个变量本身——有些主题定义了这个变量但实际渲染时并不使用它（背景是加在 `thead tr` 这一整行上，或者干脆加在 `<th>` 自己身上，因主题而异），变量值和真实视觉效果可能对不上。解决方案：往 `.markdown-preview-view` 里插入一个真实的 `<table><thead><tr><th>`，按 `th` 自身 → `tr` → `thead` 的优先级依次读 `getComputedStyle().backgroundColor`，取第一个非透明值——这样不管当前主题把背景画在哪一层，都能读到实际生效的颜色。

**表头文字色**：`th` 之前完全没有单独的文字颜色占位符，一直继承正文色渲染；改为在 `th_open` 里加一个 `color: #2d3748` 占位符，`obsidian` 主题下用 `readTableHeaderVars()` 顺带读到的 `th` computed color 覆盖，静态主题下统一用 `theme.accent`。

**边框色**：改用专门的 `--table-border-color`，不再复用通用的 `--background-modifier-border`（后者是给普通 UI 分隔线用的，颜色未必和表格边框一致，只是恰好在测试主题里数值相同才没被早发现）。

**列对齐**：markdown-it 的表格解析规则本来就会把 `:---:`/`---:`/`:---` 解析成 `style="text-align:xxx"` 挂在 th/td token 的 attrs 上，但 `parser.ts` 自定义的 `th_open`/`td_open` 渲染规则完全无视 token，直接返回写死的字符串，把这个信息丢掉了。解决方案：读取 `tokens[idx].attrGet('style')` 里的 `text-align` 值拼回输出。

---

## 9. 已知限制与风险

| 限制/风险 | 说明 | 应对 |
|-----------|------|------|
| 外部图片不稳定 | 微信编辑器抓取外部图片行为不稳定 | 建议使用本地图片或图床 |
| base64 图片体积 | 大量图片导致 HTML 过大 | 未来可加图床上传选项 |
| 主题替换表维护 | parser.ts 输出的 hardcoded 占位色值 ↔ engine.ts/themes.ts 的 regex 替换表之间是隐式契约 | 修改 parser 样式时须同步检查占位色是否被下游正确捕获；新增静态主题本身已通过注册表模式免于逐文件改 if/else |
| 微信过滤规则变化 | 新版微信编辑器可能调整过滤规则 | 每次更新后回归测试 |
| Mermaid 颜色精确度（`obsidian` 主题） | 实时主题下仍用 Mermaid 内置 dark/default 主题，不完全匹配 Obsidian 当前主题配色 | 静态主题已通过 `buildMermaidInit()` 用主题自身色值映射 themeVariables，只有 `obsidian` 实时模式待改进 |
| 橙心 callout 是固定色板 | 早期实现过"跟随当前 Obsidian 主题实时变化"，后按用户要求改回固定色板（专门设计、区分 13 种类型、统一橙心自己的暖色家族），不再联动 Obsidian 主题 | 属于确认过的设计决策，非 bug；如需恢复实时联动可参考 8.8 提到的 `readCalloutStyle` 实时读取路径 |

---

## 10. 开发路线图

### 阶段一：基础转换（✅ 已完成并持续迭代，当前 v0.6.0）

- [x] 插件骨架（esbuild 打包配置）
- [x] Frontmatter 提取与移除
- [x] 标准 Markdown 元素（标题 H1–H6、段落、列表、加粗、斜体、链接、表格【含列对齐】、引用、分割线）
- [x] 代码块语法高亮（highlight.js，GitHub Light 配色作为占位色，随主题替换）
- [x] 行内代码样式
- [x] Callout 块（`> [!type]`，13 种类型 + 别名；`obsidian` 主题跟随实时变量，静态主题走各自色板），普通 blockquote（accent 竖线）
- [x] WikiLink（`[[link]]` → 灰色文字）
- [x] 高亮（`==text==` → `<mark>`）
- [x] 删除线（`~~text~~` → `<del>`）
- [x] 任务列表（7 种状态，公众号自有风格）
- [x] 脚注（上标引用 + 底部定义区，微信兼容，无锚链接）
- [x] `#tag` 移除
- [x] 图片嵌入（`![[image.png]]`，base64，支持宽度限制 `|300`）
- [x] 笔记内联展开（`![[note.md]]`，递归深度 3，MetadataCache 解析）
- [x] 主题系统重构为注册表（`obsidian` 实时 + 9 款静态预设主题，见 4.3）
  - H1–H6 各级标题色独立读取（`--h1-color` … `--h6-color`），部分主题的元素级作用域变量（真实插入 `<h1>`–`<h6>`/`<blockquote>` 读取）
  - 表格表头背景/文字色、边框色改为读取实际生效值/专用变量（见 8.9）
  - 任务列表样式与主题解耦（固定配色）
  - 橙心主题的色块横幅标题（`headingBanner`）+ SVG 背景图三角旗（自动匹配换行后的徽标高度，不用 `<img>` 是因为其内在宽高比会干扰 flex 拉伸计算）
  - 预览弹窗/预览面板均可直接切换主题，无需前往设置页
- [x] 数学公式（`$...$` / `$$...$$`，MathJax CHTML + html2canvas，编辑/阅读模式均支持，iframe 隔离批量渲染，2x PNG）
- [x] Mermaid 图表（MarkdownRenderer offscreen → SVG → Canvas 2x PNG，深/浅色模式自动切换，静态主题按自身色值映射 themeVariables，fallback 样式化文本块）
- [x] 高亮文字颜色跟随主题（同时读取 `<mark>` 的 backgroundColor 和 color）
- [x] 预览弹窗（行高、li margin、嵌套列表 margin 均跟随主题探针；标题栏可拖拽；主题切换器）
- [x] 右侧预览面板（ItemView，切换文件自动刷新，手动刷新按钮，关闭时同步折叠右侧分栏，内容就绪前隐藏手机框，渲染逻辑与弹窗共用；主题切换器；窄屏工具栏自动换行）
- [x] ClipboardItem API 富文本写入
- [x] 设置页面（主题、图片模式、调试模式等）

### 阶段二：微信公众号 API 自动发布（待开始）

- [ ] `WeChatApiClient` 模块（Token 管理 + 图片上传 + 草稿创建）
- [ ] 设置页新增公众号配置区（AppID / AppSecret）
- [ ] 发布确认弹窗（编辑标题、摘要、封面）
- [ ] 图片上传缓存（hash → 微信 URL）
- [ ] Frontmatter 到公众号字段的映射
- [ ] 网络错误重试

### 后续计划

- [ ] Mermaid 颜色精确匹配（`obsidian` 实时主题下用 `theme:base` + themeVariables 映射 Obsidian CSS 变量；静态主题已完成）
- [ ] 图床上传（SM.MS / 阿里云 OSS 等）
- [ ] 提交 Obsidian 社区插件审核
- [ ] `![[note#heading]]` / `![[note#^block-id]]` 锚点精确嵌入：目前 `preprocessEmbeds()` 会忽略 `#` 之后的锚点，直接展开整篇笔记（见 4.3 模块 1 和 8.7）。真正实现需要解析目标笔记的标题层级，定位该 heading 到下一个同级/更高级 heading 之间的区间作为展开边界；block 引用（`^block-id`）还需要单独在笔记正文里搜索对应的 block-id 标记并定位其所在的单个块。已评估过工作量，暂不实现，先记录在此

---

## 11. 依赖清单

| 依赖包 | 用途 | 说明 |
|--------|------|------|
| `markdown-it` | Markdown → HTML | 核心解析器 |
| `highlight.js` | 代码语法高亮 | 按需导入语言包（~15 种） |
| `html2canvas` | DOM → PNG 截图 | 数学公式渲染，iframe 隔离批量捕获 |
| `obsidian` | Obsidian API 类型 | devDependency，运行时由宿主提供 |

无运行时 CSS 内联库（不使用 juice）。

---

## 附录：参考资料

- Obsidian 开发者文档：https://docs.obsidian.md
- Obsidian 插件模板：https://github.com/obsidianmd/obsidian-sample-plugin
- Obsidian API 类型定义：https://github.com/obsidianmd/obsidian-api
- markdown-it：https://github.com/markdown-it/markdown-it
- highlight.js：https://highlightjs.org
- 微信公众号开发文档：https://developers.weixin.qq.com/doc/offiaccount/

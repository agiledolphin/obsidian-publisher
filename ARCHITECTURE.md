# Obsidian WeChat Publisher 插件架构设计文档

> **版本**：v2.0  
> **日期**：2026-04-05  
> **目标平台**：微信公众号  
> **开发策略**：分阶段交付——先实现转换与复制，再实现 API 发布

---

## 1. 项目概述

### 1.1 项目目标

开发一个 Obsidian 社区插件，将 Obsidian 的 Markdown 文档转换为微信公众号兼容的富文本 HTML，并支持一键复制到剪贴板。用户复制后，可直接粘贴到公众号编辑器中，保留排版样式。后续阶段再通过微信 API 实现自动化发布。

### 1.2 分阶段策略

| 阶段 | 目标 | 用户操作 |
|------|------|----------|
| **阶段一（当前）** | 转换 + 复制 | 插件转换 → 复制到剪贴板 → 用户手动粘贴到公众号编辑器 |
| **阶段二（未来）** | API 自动发布 | 插件转换 → 自动上传图片 → 创建草稿 → 用户在后台确认发布 |

**阶段一的优势**：
- 零配置即可使用，无需 AppID/AppSecret
- 无需处理 IP 白名单、Token 管理等复杂逻辑
- 用户可以在粘贴后手动微调排版
- 开发周期短，快速验证核心转换效果
- 图片通过公众号编辑器自动上传，无需调用素材 API

### 1.3 现有参考

社区中已有类似插件 `obsidian-wechat-public-platform`，该插件使用 `juice` 库做样式内联。本项目将在其基础上进行更完善的架构设计，重点改进样式还原度和用户体验。

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

插件代码使用 TypeScript 编写，通过 esbuild 或 Rollup 打包。官方提供了模板仓库 `obsidian-sample-plugin`，建议直接 fork 使用。

### 2.2 核心 API

Obsidian 通过 `this.app` 暴露核心接口：

- **`Vault`**：读写 vault 中的文件和文件夹。通过 `vault.read(file)` 获取文件内容，`vault.readBinary(file)` 读取二进制文件（图片），`vault.getAbstractFileByPath()` 定位文件。
- **`Workspace`**：管理编辑器面板。通过 `workspace.getActiveFile()` 获取当前打开的文件。
- **`MetadataCache`**：缓存的 Markdown 元数据（标题、链接、嵌入、标签等），可用于解析 frontmatter。
- **`Plugin`** 基类：提供 `loadData()` / `saveData()` 用于持久化插件配置，`addCommand()` 注册命令，`addSettingTab()` 注册设置页面。

### 2.3 插件生命周期

```
onload()    → 插件启用时调用，注册命令、事件、设置页
onunload()  → 插件禁用时调用，清理资源
```

### 2.4 开发环境搭建

```bash
# 1. 克隆官方模板
git clone https://github.com/obsidianmd/obsidian-sample-plugin.git obsidian-wechat-publisher
cd obsidian-wechat-publisher

# 2. 安装依赖
npm install

# 3. 开发模式（自动编译）
npm run dev

# 4. 将插件目录软链接到你的测试 vault
ln -s $(pwd) /path/to/vault/.obsidian/plugins/obsidian-wechat-publisher

# 5. 在 Obsidian 中启用插件（设置 → 第三方插件 → 启用）
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
| `%` 单位 | 在 `transform`、`margin-top` 等属性中失效 |

### 3.2 支持的 HTML 标签

`<p>`、`<h1>`~`<h6>`、`<strong>`/`<b>`、`<em>`/`<i>`、`<u>`、`<br>`、`<hr>`、`<img>`、`<a>`、`<table>`/`<tr>`/`<td>`/`<th>`、`<ul>`/`<ol>`/`<li>`、`<blockquote>`、`<pre>`/`<code>`、`<span>`、`<div>`/`<section>`、`<sub>`/`<sup>`、`<svg>`（部分支持）

### 3.3 支持的内联 CSS 属性

`color`、`font-size`、`font-family`、`font-weight`、`font-style`、`line-height`、`letter-spacing`、`text-align`、`text-indent`、`text-decoration`、`margin`（各方向）、`padding`（各方向）、`border`（各方向及 border-radius）、`background-color`、`background-image`（有限支持）、`box-shadow`、`max-width`、`width`/`height`、`display`（block/inline/inline-block/flex）、`overflow-x`（用于代码块横向滚动）、`white-space`、`word-break`、`vertical-align`、`list-style-type`

### 3.4 图片约束

- 外部图片链接会被微信过滤，粘贴到编辑器后微信会自动尝试抓取并转存到微信服务器
- 大部分 HTTPS 图片链接在粘贴时可被微信成功抓取
- base64 内嵌图片在粘贴时**可能不被支持**（行为不稳定）
- 最可靠的方式：在阶段一中将本地图片转为 base64 嵌入 HTML，粘贴后让微信编辑器自行处理；或提供图床上传支持

### 3.5 富文本粘贴机制

微信公众号编辑器支持从网页复制富文本粘贴。其原理是：当从网页上复制内容时，剪贴板中包含 `text/html` 格式的富文本数据，粘贴到公众号编辑器时会保留内联样式的格式信息。

**这是阶段一的核心交互方式**：我们将带有内联样式的 HTML 写入剪贴板的 `text/html` 格式，用户粘贴到公众号编辑器即可保留样式。

---

## 4. 核心架构设计（阶段一：转换与复制）

### 4.1 整体架构图

```
┌────────────────────────────────────────────────────────────┐
│                    Obsidian Plugin Layer                    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Commands │  │ Settings Tab │  │ Notice / StatusBar   │  │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘  │
│       │               │                     │              │
│  ┌────▼───────────────▼─────────────────────▼───────────┐  │
│  │               ConvertController                       │  │
│  │         （转换流程编排 / 错误处理）                      │  │
│  └──┬──────────┬──────────────┬──────────────┬──────────┘  │
│     │          │              │              │             │
│  ┌──▼───┐  ┌──▼──────┐  ┌───▼────────┐  ┌──▼──────────┐  │
│  │ Mark │  │  Image  │  │   Style    │  │  Clipboard  │  │
│  │ down │  │  Embed- │  │   Engine   │  │  Writer     │  │
│  │ Pars │  │  der    │  │            │  │             │  │
│  │ er   │  │         │  │            │  │             │  │
│  └──┬───┘  └────┬────┘  └─────┬──────┘  └──────┬──────┘  │
│     │           │             │                 │          │
│     ▼           ▼             ▼                 ▼          │
│  Markdown   本地图片      CSS 主题         系统剪贴板      │
│  → HTML     → base64     → 内联样式       (text/html)     │
└────────────────────────────────────────────────────────────┘
```

**与 v1 架构的核心差异**：
- 去掉了 `WeChatApiClient` 模块（移至阶段二）
- `ImageProcessor` 改为 `ImageEmbedder`（不上传微信，改为 base64 嵌入）
- `PublishController` 改为 `ConvertController`（不发布，改为复制到剪贴板）
- 新增 `ClipboardWriter` 模块（富文本写入剪贴板）
- 设置页无需 AppID/AppSecret 配置

### 4.2 模块详细设计

#### 模块 1：MarkdownParser（Markdown 解析器）

**职责**：将 Obsidian 的 Markdown 内容转换为带语义 class 的标准 HTML

**输入**：Obsidian Markdown 原文（含 frontmatter）

**输出**：结构化 HTML（带 class 标记，尚未内联样式）

**需处理的 Obsidian 特殊语法**：

| 语法 | 示例 | 处理方式 |
|------|------|----------|
| Frontmatter | `---\ntitle: ...\n---` | 提取元数据，不输出到 HTML |
| Wiki Links | `[[页面名]]` | 转为纯文本（不可点击）或移除双括号 |
| 嵌入文件 | `![[image.png]]` | 解析为 `<img>` 标签，src 指向 vault 内路径 |
| 嵌入笔记 | `![[note]]` | 展开被嵌入笔记的内容（递归处理） |
| Callout | `> [!note] 标题` | 转为 `<div class="callout callout-note">` |
| 代码块 | ` ```js ... ``` ` | 使用 highlight.js 做语法高亮 |
| 行内代码 | `` `code` `` | 转为 `<code>` 标签 |
| 数学公式 | `$E=mc^2$` / `$$...$$` | 渲染为 SVG/PNG 图片 |
| Mermaid | ` ```mermaid ... ``` ` | 渲染为 SVG/PNG 图片 |
| 标签 | `#tag` | 移除或转为纯文本 |
| 高亮 | `==高亮文本==` | 转为 `<mark>` 标签 |
| 删除线 | `~~删除线~~` | 转为 `<del>` 标签 |
| 脚注 | `[^1]` | 转为文末注释 |
| 任务列表 | `- [x] 已完成` | 转为带 checkbox 样式的列表 |

**技术选型**：使用 `markdown-it` 作为基础解析器，通过自定义插件扩展 Obsidian 语法。

```typescript
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      const highlighted = hljs.highlight(str, { language: lang }).value;
      return `<pre class="code-block"><code class="language-${lang}">${highlighted}</code></pre>`;
    }
    return `<pre class="code-block"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});

// 注册自定义插件
md.use(obsidianCalloutPlugin);   // > [!type] 语法
md.use(obsidianWikiLinkPlugin);  // [[link]] 语法
md.use(obsidianHighlightPlugin); // ==highlight== 语法
md.use(obsidianEmbedPlugin);     // ![[embed]] 语法
```

#### 模块 2：ImageEmbedder（图片嵌入器）

**职责**：将 HTML 中引用的本地图片转换为可在粘贴时被公众号编辑器处理的格式

**阶段一策略**：

由于不调用微信 API，图片有以下几种处理方案（按优先级排列）：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| **A. base64 嵌入** | 将图片转为 `data:image/png;base64,...` 嵌入 `<img>` | 实现简单，单一 HTML | 微信编辑器对 base64 图片支持不稳定 |
| **B. 图床上传** | 上传到 SM.MS / imgur 等免费图床 | 兼容性好 | 需额外配置图床账号 |
| **C. 本地服务器** | 启动临时 HTTP 服务器托管图片 | 无需外部服务 | 复制后需保持服务器运行 |
| **D. 手动处理** | HTML 中标注图片位置，用户手动插入 | 最简单 | 用户体验差 |

**推荐方案**：默认使用 **方案 A（base64）**，同时提供 **方案 B（图床）** 作为可选配置。如果 base64 在微信编辑器中无法显示，用户可切换到图床模式。

```typescript
class ImageEmbedder {
  /**
   * 扫描 HTML 中的所有本地图片，转换为 base64
   */
  async embedImages(html: string, basePath: string): Promise<string> {
    const imgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g;
    let result = html;
    
    for (const match of html.matchAll(imgRegex)) {
      const src = match[1];
      if (this.isLocalPath(src)) {
        const base64 = await this.readAsBase64(src, basePath);
        result = result.replace(src, base64);
      }
    }
    return result;
  }
  
  private async readAsBase64(path: string, basePath: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(
      normalizePath(`${basePath}/${path}`)
    );
    if (file instanceof TFile) {
      const buffer = await this.vault.readBinary(file);
      const base64 = arrayBufferToBase64(buffer);
      const mime = this.getMimeType(file.extension);
      return `data:${mime};base64,${base64}`;
    }
    return path; // 无法处理的路径保持原样
  }
}
```

#### 模块 3：StyleEngine（样式引擎）

**职责**：将 CSS 样式内联到 HTML 元素上，确保粘贴到微信后保留格式

**工作流程**：

```
1. 加载 CSS 样式表（按优先级叠加）
   ├── base.css        — 基础重置样式
   ├── theme.css       — 当前主题（亮色 / 暗色 / 自定义）
   ├── code.css        — 代码高亮主题（基于 highlight.js）
   └── custom.css      — 用户自定义样式（最高优先级）
       
2. 使用 juice 库将 CSS 内联到 HTML
   juice.inlineContent(html, combinedCSS, {
     preserveMediaQueries: false,
     removeStyleTags: true,
     insertPreservedExtraCss: false
   })

3. 后处理：微信兼容性清理（sanitizer）
   - 移除 position 相关属性
   - 移除残留的 class / id 属性
   - 将 % 单位替换为 px / vw（在必要属性上）
   - 移除空的 style 属性
   - 移除 data-* 自定义属性
```

**预设主题样式**（模拟 Obsidian 默认风格）：

```css
/* ============================================
   base.css — 基础重置
   ============================================ */
.wechat-article {
  max-width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
               "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
               sans-serif;
  font-size: 16px;
  color: #333333;
  line-height: 1.75;
  letter-spacing: 0.5px;
  word-break: break-word;
}

/* ============================================
   theme-light.css — 亮色主题
   ============================================ */

/* --- 段落 --- */
p { font-size: 16px; color: #333; line-height: 1.75; margin: 0 0 1em 0; }

/* --- 标题 --- */
h1 { font-size: 24px; color: #1a1a1a; font-weight: 700; line-height: 1.3;
     margin: 1.5em 0 0.8em 0; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.3em; }
h2 { font-size: 20px; color: #1a1a1a; font-weight: 600; line-height: 1.3;
     margin: 1.3em 0 0.6em 0; }
h3 { font-size: 18px; color: #1a1a1a; font-weight: 600; line-height: 1.3;
     margin: 1.2em 0 0.5em 0; }

/* --- 代码块 --- */
pre.code-block {
  background-color: #f6f8fa; border-radius: 6px; padding: 16px;
  overflow-x: auto; font-size: 14px; line-height: 1.6; margin: 1em 0;
}
pre.code-block code {
  font-family: "SF Mono", "Monaco", "Menlo", "Consolas", "Courier New", monospace;
  font-size: 14px; background: none; padding: 0;
}

/* --- 行内代码 --- */
code {
  background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px;
  font-size: 14px; color: #c7254e;
  font-family: "SF Mono", "Monaco", "Menlo", "Consolas", "Courier New", monospace;
}

/* --- 引用块 --- */
blockquote {
  border-left: 4px solid #7c3aed; padding: 12px 16px; margin: 1em 0;
  background-color: #f9f5ff; color: #555; font-size: 15px;
}
blockquote p { margin: 0.5em 0; }

/* --- Callout 块 --- */
.callout { padding: 12px 16px; margin: 1em 0; border-radius: 4px; border-left: 4px solid; }
.callout-title { font-weight: 600; margin-bottom: 0.5em; font-size: 16px; }
.callout-note    { border-left-color: #448aff; background-color: #e8f0fe; }
.callout-tip     { border-left-color: #00c853; background-color: #e8f5e9; }
.callout-warning { border-left-color: #ff9800; background-color: #fff8e1; }
.callout-danger  { border-left-color: #f44336; background-color: #ffebee; }
.callout-info    { border-left-color: #2196f3; background-color: #e3f2fd; }
.callout-example { border-left-color: #9c27b0; background-color: #f3e5f5; }

/* --- 表格 --- */
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 15px; }
th { background-color: #f2f2f2; font-weight: 600; text-align: left;
     padding: 10px 12px; border: 1px solid #ddd; }
td { padding: 10px 12px; border: 1px solid #ddd; }

/* --- 图片 --- */
img { max-width: 100%; border-radius: 4px; margin: 1em auto; display: block; }

/* --- 链接 --- */
a { color: #576b95; text-decoration: none; }

/* --- 列表 --- */
ul, ol { padding-left: 2em; margin: 0.5em 0; }
li { font-size: 16px; line-height: 1.75; margin: 0.3em 0; }

/* --- 高亮 --- */
mark { background-color: #fff3b0; padding: 2px 4px; border-radius: 2px; }

/* --- 分割线 --- */
hr { border: none; border-top: 1px solid #e5e5e5; margin: 2em 0; }

/* --- 任务列表 --- */
.task-done { text-decoration: line-through; color: #999; }

/* --- 脚注 --- */
.footnotes { margin-top: 2em; padding-top: 1em;
             border-top: 1px solid #e5e5e5; font-size: 14px; color: #666; }
```

**微信兼容性清理器（Sanitizer）**：

```typescript
function sanitizeForWeChat(html: string): string {
  html = html.replace(/position\s*:\s*\w+\s*;?/gi, '');
  html = html.replace(/\s+class="[^"]*"/gi, '');
  html = html.replace(/\s+id="[^"]*"/gi, '');
  html = html.replace(/\s+style=""/gi, '');
  html = html.replace(/\s+data-\w+="[^"]*"/gi, '');
  return html;
}
```

#### 模块 4：ClipboardWriter（剪贴板写入器）

**职责**：将最终的 HTML 以富文本格式写入系统剪贴板

**核心原理**：利用浏览器的选区复制机制——创建一个临时 DOM 节点，将 HTML 插入其中，选中后执行 `copy` 命令。这样剪贴板中就包含了 `text/html` 格式的数据，粘贴到公众号编辑器时会保留内联样式。

```typescript
function copyRichText(html: string): void {
  // 1. 创建临时容器
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);
  
  // 2. 选中容器内容
  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  
  // 3. 执行复制
  document.execCommand('copy');
  
  // 4. 清理
  selection?.removeAllRanges();
  document.body.removeChild(container);
}
```

**为什么用 DOM copy 而不用 Electron clipboard API**：
- 兼容性最好，与"从网页复制"的行为一致
- 微信编辑器能正确识别这种方式产生的富文本
- 无需处理 Electron 模块引用的打包问题
- 在 Obsidian 移动端也可能兼容（待验证）

#### 模块 5：ConvertController（转换流程控制器）

**职责**：编排整个转换流程，协调各模块协作

**流程状态机**：

```
IDLE → PARSING → EMBEDDING_IMAGES → INLINING_STYLES → SANITIZING → COPYING → DONE
                                                                              ↗
                               任何阶段出错 ──→ ERROR ──→ IDLE
```

**完整转换流程**：

```typescript
async function convertAndCopy(file: TFile): Promise<void> {
  try {
    // 1. 读取文件内容
    const markdown = await this.vault.read(file);
    
    // 2. 提取 frontmatter 元数据，移除 frontmatter 块
    const { metadata, body } = parseFrontmatter(markdown);
    
    // 3. Markdown → HTML（带 class 标记）
    const rawHtml = this.markdownParser.render(body);
    
    // 4. 处理图片（本地图片 → base64 嵌入）
    const htmlWithImages = await this.imageEmbedder.embedImages(
      rawHtml, 
      file.parent?.path || ''
    );
    
    // 5. 样式内联化
    const styledHtml = this.styleEngine.inlineStyles(htmlWithImages);
    
    // 6. 微信兼容性清理
    const cleanHtml = sanitizeForWeChat(styledHtml);
    
    // 7. 包装完整 HTML
    const finalHtml = `<div>${cleanHtml}</div>`;
    
    // 8. 写入剪贴板
    copyRichText(finalHtml);
    
    // 9. 通知用户
    new Notice('已复制到剪贴板！请到公众号编辑器中粘贴。');
    
  } catch (error) {
    new Notice(`转换失败：${error.message}`);
    console.error('WeChat Publisher:', error);
  }
}
```

---

## 5. 用户界面设计（阶段一）

### 5.1 设置页面

```
┌─────────────────────────────────────────────┐
│  WeChat Publisher 设置                       │
│─────────────────────────────────────────────│
│                                             │
│  ▸ 样式设置                                  │
│    主题:       [▼ Obsidian Light    ]        │
│                  ├ Obsidian Light             │
│                  ├ Obsidian Dark              │
│                  ├ 简约                        │
│                  └ 自定义                      │
│    自定义CSS:  [编辑自定义样式...]             │
│    [预览效果]  [重置为默认]                    │
│                                             │
│  ▸ 图片设置                                  │
│    图片处理:   ○ base64 嵌入（默认）           │
│               ○ 图床上传                      │
│    图床配置:   [▼ SM.MS            ] (灰色)   │
│    图床 Token: [___________________] (灰色)   │
│                                             │
│  ▸ 转换选项                                  │
│    移除 Frontmatter:  [✓]                    │
│    移除标签 #tag:     [✓]                    │
│    Wiki Link 处理:    [▼ 转为纯文本  ]        │
│    脚注位置:          [▼ 文末         ]        │
│                                             │
│  ▸ 高级选项                                  │
│    调试：输出 HTML 到控制台:  [ ]              │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.2 命令注册

| 命令 | 快捷键建议 | 说明 |
|------|-----------|------|
| 复制为公众号格式 | Ctrl/Cmd + Shift + W | 转换当前文档并复制到剪贴板 |
| 预览公众号效果 | — | 弹窗预览转换后的 HTML 效果 |

```typescript
export default class WeChatPublisherPlugin extends Plugin {
  async onload() {
    // "复制为公众号格式"命令
    this.addCommand({
      id: 'copy-as-wechat',
      name: '复制为公众号格式',
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file) this.convertController.convertAndCopy(file);
        else new Notice('请先打开一个 Markdown 文件');
      },
    });
    
    // "预览公众号效果"命令
    this.addCommand({
      id: 'preview-wechat',
      name: '预览公众号效果',
      callback: () => this.showPreview(),
    });
    
    // 右键菜单
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item.setTitle('复制为公众号格式')
              .setIcon('clipboard-copy')
              .onClick(() => this.convertController.convertAndCopy(file));
          });
        }
      })
    );
    
    this.addSettingTab(new WeChatPublisherSettingTab(this.app, this));
  }
}
```

### 5.3 预览弹窗

提供一个 Modal 弹窗，模拟手机宽度（375px）展示转换效果，并提供"复制"按钮：

```typescript
class PreviewModal extends Modal {
  constructor(app: App, private html: string) { super(app); }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '公众号预览' });
    
    // 模拟手机宽度的预览区
    const preview = contentEl.createDiv();
    preview.style.cssText = 'max-width:375px; margin:0 auto; border:1px solid #e5e5e5; ' +
                            'padding:16px; border-radius:8px; max-height:60vh; overflow-y:auto;';
    preview.innerHTML = this.html;
    
    // 操作按钮
    const bar = contentEl.createDiv({ cls: 'button-bar' });
    bar.createEl('button', { text: '复制到剪贴板' })
       .addEventListener('click', () => { copyRichText(this.html); new Notice('已复制！'); this.close(); });
    bar.createEl('button', { text: '取消' })
       .addEventListener('click', () => this.close());
  }
}
```

---

## 6. 项目文件结构

```
obsidian-wechat-publisher/
├── src/
│   ├── main.ts                   # 插件入口
│   ├── convert-controller.ts     # 转换流程控制器
│   ├── markdown/
│   │   ├── parser.ts             # Markdown 解析核心
│   │   ├── plugins/
│   │   │   ├── callout.ts        # Callout 语法
│   │   │   ├── wikilink.ts       # Wiki Link
│   │   │   ├── embed.ts          # 嵌入内容
│   │   │   ├── highlight-mark.ts # ==高亮==
│   │   │   ├── math.ts           # 数学公式
│   │   │   └── task-list.ts      # 任务列表
│   │   └── frontmatter.ts        # Frontmatter 解析
│   ├── image/
│   │   ├── embedder.ts           # 图片 base64 嵌入
│   │   └── uploader.ts           # 图床上传（可选）
│   ├── style/
│   │   ├── engine.ts             # 样式内联引擎
│   │   ├── sanitizer.ts          # 微信兼容性清理
│   │   └── themes/
│   │       ├── base.css
│   │       ├── light.css
│   │       ├── dark.css
│   │       ├── minimal.css
│   │       └── code/
│   │           ├── github.css
│   │           └── monokai.css
│   ├── clipboard/
│   │   └── writer.ts             # 富文本剪贴板写入
│   ├── ui/
│   │   ├── settings-tab.ts       # 设置页面
│   │   └── preview-modal.ts      # 预览弹窗
│   └── utils/
│       ├── logger.ts
│       └── mime.ts
├── styles.css                    # 插件自身 UI 样式
├── manifest.json
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
│  提取 title 等元数据        │
│  移除 frontmatter 块        │
└────────────────────────────┘
        │
        ▼ (纯 Markdown body)
┌─── markdown-it 解析 ──────┐
│  标准 MD → HTML             │
│  + highlight.js 代码高亮    │
│  + Obsidian 语法插件:       │
│    - Callout → styled div   │
│    - WikiLink → plain text  │
│    - ==高亮== → <mark>      │
│    - Task list → checkbox   │
│    - Footnotes → 文末注释   │
│  + 数学公式 → SVG/PNG       │
│  + Mermaid → SVG/PNG        │
└────────────────────────────┘
        │
        ▼ (带 class 的 HTML)
┌─── 图片嵌入 ──────────────┐
│  扫描所有 <img> src         │
│  本地图片 → base64 data URL │
│  外部图片 → 保持原 URL      │
│  公式/图表 SVG → base64     │
└────────────────────────────┘
        │
        ▼ (图片已嵌入的 HTML)
┌─── 样式内联 ──────────────┐
│  加载 CSS: base + theme     │
│  + code highlight + custom  │
│  juice.inlineContent()      │
└────────────────────────────┘
        │
        ▼ (内联样式 HTML)
┌─── 微信兼容性清理 ────────┐
│  移除 position / class / id │
│  移除 data-* 属性           │
│  清理空 style 属性          │
└────────────────────────────┘
        │
        ▼ (最终清洁 HTML)
┌─── 写入剪贴板 ────────────┐
│  创建临时 DOM 节点           │
│  selection + execCommand     │
│  → 系统剪贴板 (text/html)   │
└────────────────────────────┘
        │
        ▼
用户在公众号编辑器中 Ctrl+V 粘贴
```

---

## 8. 关键技术方案

### 8.1 代码块处理

```typescript
// highlight.js 生成带 class 的 <span>：
//   <span class="hljs-keyword">const</span>
//
// juice 内联后变为：
//   <span style="color: #569cd6;">const</span>
//
// 代码块容器需要横向滚动：
//   <pre style="overflow-x: auto; white-space: pre;">
```

### 8.2 数学公式处理

微信不支持 KaTeX JS 渲染，两种备选方案：

**方案 A**（推荐先尝试）：将 KaTeX 的 CSS 与其生成的 HTML 一起内联，直接作为富文本输出。KaTeX 的 HTML 输出由大量 `<span>` 组成，配合其 CSS 可以纯靠 HTML+CSS 渲染公式。

**方案 B**（降级）：KaTeX → SVG → Canvas → PNG → base64 `<img>`。更简单可靠，但公式变成了图片，放大后会模糊。

### 8.3 Mermaid 图表处理

Mermaid 依赖 DOM 渲染，在 Obsidian（Electron）中可使用隐藏 div 离屏渲染：

```typescript
async function renderMermaidToBase64(code: string): Promise<string> {
  const mermaid = await import('mermaid');  // 动态加载，减小初始包体积
  mermaid.default.initialize({ startOnLoad: false, theme: 'default' });
  
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed; left:-9999px;';
  document.body.appendChild(container);
  
  const { svg } = await mermaid.default.render('mermaid-temp', code, container);
  document.body.removeChild(container);
  
  return svgToBase64Png(svg);  // 转为 base64 PNG
}
```

### 8.4 Callout 语法解析

Obsidian 的 Callout 是标准 Markdown 没有的扩展语法。markdown-it 插件需拦截 `blockquote` 渲染，检测 `[!type]` 标记：

```typescript
function obsidianCalloutPlugin(md: MarkdownIt) {
  // 拦截 blockquote 渲染规则
  // 检测第一行是否匹配 [!type] pattern
  // 匹配 → 输出 <div class="callout callout-{type}">
  // 不匹配 → 正常输出 <blockquote>
}
```

---

## 9. 依赖清单

### 阶段一依赖（转换与复制）

| 依赖包 | 用途 | 大小估算 | 必要性 |
|--------|------|---------|--------|
| `markdown-it` | Markdown → HTML | ~30KB | 必须 |
| `highlight.js` | 代码语法高亮 | ~50KB（按需语言包） | 必须 |
| `juice` | CSS 内联化 | ~20KB | 必须 |
| `katex` | 数学公式渲染 | ~300KB | 可选（动态加载） |
| `mermaid` | 图表渲染 | ~500KB | 可选（动态加载） |

**打包策略**：`markdown-it` + `highlight.js`（核心语言包）+ `juice` 静态打包；`katex` 和 `mermaid` 使用动态 `import()` 按需加载。

### 阶段二新增依赖

无新增——使用 Obsidian 内置 `requestUrl` 调用微信 API。

---

## 10. 错误处理

| 错误类型 | 示例 | 处理方式 |
|----------|------|----------|
| 无活动文件 | 未打开任何 .md 文件 | Notice 提示 |
| 图片读取失败 | 引用图片不存在 | 跳过，Notice 警告列出未处理图片 |
| 解析异常 | 极端嵌套语法 | 降级为纯文本，记录日志 |
| 公式渲染失败 | LaTeX 语法错误 | 显示公式源码 |
| Mermaid 渲染失败 | 图表语法错误 | 显示代码块原文 |
| 剪贴板写入失败 | 权限问题 | 提供"复制 HTML 源码"降级选项 |

---

## 11. 开发路线图

### Phase 1：基础转换（预计 1.5~2 周）

**目标**：跑通"Markdown → 带样式 HTML → 剪贴板复制"最短路径

- [ ] 搭建插件骨架（fork 官方模板，配置 esbuild 打包）
- [ ] `MarkdownParser` 基础功能（标题、段落、列表、加粗、斜体、链接、表格、引用、分割线、代码块容器）
- [ ] Frontmatter 提取与移除
- [ ] `StyleEngine`（加载默认亮色主题 CSS + juice 内联 + sanitizer 清理）
- [ ] `ClipboardWriter`（DOM copy 方式）
- [ ] `ConvertController` 编排流程
- [ ] 注册"复制为公众号格式"命令 + 右键菜单
- [ ] 基础 `SettingsTab`（主题选择）
- [ ] **验收**：转换一篇简单文章 → 粘贴到公众号编辑器 → 确认格式正确

### Phase 2：样式增强与 Obsidian 语法（预计 2 周）

**目标**：覆盖所有常用元素，支持 Obsidian 特有语法

- [ ] 代码块语法高亮（highlight.js 集成 + 高亮主题 CSS 内联）
- [ ] 行内代码样式
- [ ] Callout 块（markdown-it 插件）
- [ ] Wiki Link（`[[]]` → 纯文本）
- [ ] 高亮（`==text==` → `<mark>`）
- [ ] 任务列表样式
- [ ] 脚注处理
- [ ] 多主题切换（亮色 / 暗色 / 简约）
- [ ] 自定义 CSS 编辑
- [ ] 预览弹窗
- [ ] `ImageEmbedder`（base64 嵌入）
- [ ] 嵌入笔记 `![[note]]` 展开（设最大递归深度 3）

### Phase 3：高级内容与打磨（预计 1.5~2 周）

**目标**：处理数学公式、图表，优化体验

- [ ] KaTeX 数学公式支持（动态加载）
- [ ] Mermaid 图表支持（动态加载 + 离屏渲染）
- [ ] 图床上传支持（SM.MS 等，作为 base64 的备选）
- [ ] 删除线、上下标等扩展格式
- [ ] 长文章性能优化
- [ ] 代码高亮语言包按需加载
- [ ] 完善错误提示
- [ ] 编写 README

### Phase 4：API 发布（预计 2~3 周）

**目标**：对接微信公众号 API，实现一键发布

- [ ] `WeChatApiClient` 模块（Token 管理 + 图片上传 + 草稿创建 + 发布）
- [ ] 设置页新增公众号配置区（AppID / AppSecret）
- [ ] 发布确认弹窗（编辑标题、摘要、封面）
- [ ] 发布进度条
- [ ] 图片上传缓存（hash → 微信 URL）
- [ ] Frontmatter 到公众号字段的映射
- [ ] 网络错误重试
- [ ] 安全提示

### Phase 5：社区发布（预计 1 周）

- [ ] 代码审查与重构
- [ ] 中英文文档完善
- [ ] 自动化测试
- [ ] 提交 Obsidian 社区插件审核
- [ ] GitHub Actions CI/CD

---

## 12. 测试策略

### 12.1 单元测试

- **MarkdownParser**：各种语法的 HTML 输出验证
- **StyleEngine**：内联化结果验证
- **Sanitizer**：微信不兼容属性的移除验证
- **Callout 插件**：各类型 callout 解析验证

### 12.2 端到端验收（手动）

准备全要素测试文档，每次改动后执行：

1. Obsidian 中打开测试文档
2. 执行"复制为公众号格式"
3. 公众号后台 → 新建图文素材 → Ctrl+V 粘贴
4. 逐项检查每个元素显示效果
5. 手机预览确认移动端正常

---

## 13. 已知风险与应对

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| 微信编辑器富文本粘贴行为不一致 | 部分样式丢失 | 维护兼容性白名单，持续测试 |
| base64 图片粘贴后不显示 | 图片丢失 | 提供图床上传作为备选 |
| highlight.js 主题内联后 HTML 过大 | 复制/粘贴变慢 | 精简代码高亮 CSS |
| Mermaid 体积大 | 插件加载慢 | 动态 import() 按需加载 |
| 微信过滤规则变化 | 样式失效 | 每次更新后回归测试 |
| 嵌入笔记递归引用 | 无限循环 | 最大递归深度 3 层 |
| 不同 Obsidian 主题 CSS 冲突 | 预览不准 | 使用独立主题 CSS |

---

## 14. 阶段二参考：微信公众号 API

> 供阶段二开发时参考，阶段一无需关注。

### API 调用流程

```
获取 Access Token → 上传图片素材 → 新建草稿 → 发布草稿（可选）
```

### 关键接口

| 接口 | URL | 说明 |
|------|-----|------|
| 获取 Token | `GET /cgi-bin/token` | 有效期 2 小时 |
| 上传文章图片 | `POST /cgi-bin/media/uploadimg` | 返回微信 URL |
| 上传永久素材 | `POST /cgi-bin/material/add_material` | 封面图 |
| 新建草稿 | `POST /cgi-bin/draft/add` | 创建图文草稿 |
| 发布草稿 | `POST /cgi-bin/freepublish/submit` | 异步发布 |

### 注意事项

- 需配置 IP 白名单
- AppSecret 需安全存储
- API 发布的文章不触发推荐，不显示在主页
- 建议默认仅创建草稿
- 测试号：https://mp.weixin.qq.com/debug/cgi-bin/sandbox

---

## 附录：参考资料

- Obsidian 开发者文档：https://docs.obsidian.md
- Obsidian 插件模板：https://github.com/obsidianmd/obsidian-sample-plugin
- Obsidian API 类型定义：https://github.com/obsidianmd/obsidian-api
- juice（CSS 内联库）：https://github.com/Automattic/juice
- markdown-it：https://github.com/markdown-it/markdown-it
- highlight.js：https://highlightjs.org
- KaTeX：https://katex.org
- 社区参考插件：obsidian-wechat-public-platform
- 微信公众号开发文档：https://developers.weixin.qq.com/doc/offiaccount/

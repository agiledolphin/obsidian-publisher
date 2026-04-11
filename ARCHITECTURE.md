# Obsidian WeChat Publisher 插件架构设计文档

> **版本**：v3.0（对应插件 v0.2.0）
> **日期**：2026-04-11
> **目标平台**：微信公众号
> **开发策略**：分阶段交付——先实现转换与复制，再实现 API 发布

---

## 1. 项目概述

### 1.1 项目目标

开发一个 Obsidian 社区插件，将 Obsidian 的 Markdown 文档转换为微信公众号兼容的富文本 HTML，并支持一键复制到剪贴板。用户复制后，可直接粘贴到公众号编辑器中，保留排版样式。后续阶段再通过微信 API 实现自动化发布。

### 1.2 分阶段策略

| 阶段 | 目标 | 状态 |
|------|------|------|
| **阶段一** | 转换 + 复制 | ✅ **已完成（v0.2.0）** |
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
1. vault.read(file)                         // 读取原始文件
2. parseFrontmatter(raw).body               // 移除 frontmatter（可配置）
3. preprocessEmbeds(markdown, ...)          // 展开 ![[image]] 和 ![[note.md]]
4. removeTags(markdown)                     // 移除 #tag（可配置）
5. processFootnotes(markdown)               // 脚注转上标 + 底部引用区
6. markdownParser.render(markdown)          // markdown-it → 带内联样式的 HTML
7. imageEmbedder.embedImages(html, ...)     // 本地图片 → base64 data URL
8. styleEngine.process(html, vars)          // 主题覆盖 + WeChat 清理 + 外层 div
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
| `obsidianCalloutPlugin` | `plugins/callout.ts` | `> [!type]` → 带样式 div |
| `obsidianWikiLinkPlugin` | `plugins/wikilink.ts` | `[[link]]` → 纯文本 |
| `obsidianHighlightPlugin` | `plugins/highlight-mark.ts` | `==text==` → `<mark>` |
| `obsidianStrikethroughPlugin` | `plugins/strikethrough.ts` | `~~text~~` → `<del>` |
| `obsidianTaskListPlugin` | `plugins/task-list.ts` | `- [ ]` / `- [x]` → 带图标列表项 |

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

#### 模块 4：StyleEngine（样式引擎）

**文件**：`src/style/engine.ts`

**职责**：将基于亮色主题硬编码的 HTML 中的颜色/样式，根据当前主题配置进行替换（字符串 regex 批量替换），然后做 WeChat 兼容性清理，最后包装外层 `<div>` 容器。

**三种主题模式**：

| 主题 | 说明 |
|------|------|
| `light` | 默认亮色主题，保持 parser 输出不变（GitHub 风格） |
| `minimal` | 简约黑白，将所有紫色 accent 替换为深灰色 |
| `obsidian` | 从当前 Obsidian 实例读取活跃主题的 CSS 变量，动态适配 |

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

读取的变量包括：背景色、文字颜色、强调色、链接色、字体、各级标题色、代码块背景、内联代码色、callout 配色（通过 `--callout-color` 读取每种类型的 RGB 值）、checkbox 圆角和边框宽度、任务完成态颜色和划线样式、高亮背景色、斜体颜色。

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
| `theme` | `'light' \| 'minimal' \| 'obsidian'` | `'light'` | 输出主题风格 |
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

模拟手机宽度（375px）预览效果，支持预览后点击"复制"按钮写入剪贴板。预览容器设置 `overflow-x: hidden` 和 `box-sizing: border-box` 防止宽图溢出。

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
│   │   ├── engine.ts                  # 主题覆盖 + CSS 变量读取 + 颜色工具
│   │   └── sanitizer.ts               # 微信兼容性清理（移除 position/class/id 等）
│   ├── clipboard/
│   │   └── writer.ts                  # ClipboardItem API 写入富文本
│   ├── ui/
│   │   ├── settings-tab.ts            # 设置页面
│   │   └── preview-modal.ts           # 预览弹窗
│   └── utils/
│       ├── logger.ts                  # 调试日志（受 debugMode 控制）
│       └── mime.ts                    # 文件扩展名 → MIME 类型
├── styles.css                         # 插件 UI 样式（预览弹窗等）
├── manifest.json                      # 版本 0.2.0
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
│  读取 Obsidian CSS 变量    │  ← 仅 obsidian 主题时
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

特殊情况：`--checkbox-radius` 和 `--checkbox-border-width` 同样使用 element injection，将变量应用为 `border-radius` / `border-width`，读取 `borderTopLeftRadius` / `borderTopWidth` 计算值。

### 8.3 代码高亮颜色

Parser 输出 GitHub Light 配色（hardcoded 颜色值）。StyleEngine 的 `applyObsidianOverrides` 将这些颜色替换为两套 Tokyo Night 配色（Day/Storm），具体选哪套由 `document.body.classList.contains('theme-dark')` 决定。

### 8.4 图片路径含空格

markdown-it 渲染 `![alt](path with spaces)` 时会 URL 编码空格，导致 `vault.getAbstractFileByPath()` 找不到文件。

解决方案：`preprocessor.ts` 直接生成 `<img src="..." style="...">` HTML 标签（而非 markdown 语法），markdown-it 的 `html: true` 选项将其透传，图片规则不再触发 URL 编码。

### 8.5 同名文件消歧

按文件名全局搜索时，如果找到多个同名文件，`embedder.ts` 记录警告并跳过（不随机选一个），提示用户在 `![[]]` 中使用完整相对路径。

### 8.6 任务列表实现

使用 flex 布局：左侧固定宽度图标（`flex-shrink: 0`）+ 右侧 `flex: 1` 内容区。已完成任务（`is-checked`）的图标为填充紫色方框+白色勾，待完成任务为空心方框。`insideDoneTask` 状态变量控制段落渲染规则，使内容同步添加删除线和灰色。

### 8.7 String.replace 特殊字符

note 展开时，嵌入内容中的 `$&`、`$'`、`$`` 等字符会被 `String.replace(pattern, replacement)` 解释为替换模式引用，导致输出损坏。解决方案：始终使用函数形式 `replace(pattern, () => content)` ，函数返回值被原样使用，不做特殊字符解释。

---

## 9. 已知限制与风险

| 限制/风险 | 说明 | 应对 |
|-----------|------|------|
| 外部图片不稳定 | 微信编辑器抓取外部图片行为不稳定 | 建议使用本地图片或图床 |
| base64 图片体积 | 大量图片导致 HTML 过大 | 未来可加图床上传选项 |
| 主题替换表维护 | engine.ts 的颜色替换依赖 hardcoded hex 值 | 修改 parser 样式时须同步更新替换表 |
| 微信过滤规则变化 | 新版微信编辑器可能调整过滤规则 | 每次更新后回归测试 |
| 数学公式 | 暂不支持 LaTeX | 待 KaTeX → SVG 方案 |
| Mermaid 图表 | 暂不支持 | 待离屏渲染方案 |

---

## 10. 开发路线图

### 阶段一：基础转换（✅ 已完成，v0.2.0）

- [x] 插件骨架（esbuild 打包配置）
- [x] Frontmatter 提取与移除
- [x] 标准 Markdown 元素（标题、段落、列表、加粗、斜体、链接、表格、引用、分割线）
- [x] 代码块语法高亮（highlight.js，GitHub Light 配色）
- [x] 行内代码样式
- [x] Callout 块（`> [!type]`）
- [x] WikiLink（`[[link]]` → 纯文本）
- [x] 高亮（`==text==` → `<mark>`）
- [x] 删除线（`~~text~~` → `<del>`）
- [x] 任务列表（`- [ ]` / `- [x]`，带样式图标）
- [x] 脚注（上标引用 + 底部定义区，微信兼容，无锚链接）
- [x] `#tag` 移除
- [x] 图片嵌入（`![[image.png]]`，base64，支持宽度限制 `|300`）
- [x] 笔记内联展开（`![[note.md]]`，递归深度 3，MetadataCache 解析）
- [x] 主题适配（`light` / `minimal` / `obsidian`，CSS 变量动态读取）
- [x] 已验证主题：Blue Topaz、Minimal、Default
- [x] 预览弹窗（375px 手机宽度）
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

- [ ] 数学公式（KaTeX → SVG/PNG）
- [ ] Mermaid 图表（离屏渲染 → PNG）
- [ ] 图床上传（SM.MS / 阿里云 OSS 等）
- [ ] 提交 Obsidian 社区插件审核

---

## 11. 依赖清单

| 依赖包 | 用途 | 说明 |
|--------|------|------|
| `markdown-it` | Markdown → HTML | 核心解析器 |
| `highlight.js` | 代码语法高亮 | 按需导入语言包（~15 种） |
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

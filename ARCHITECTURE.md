# Obsidian WeChat Publisher 插件架构设计文档

> **版本**：v11.0（对应插件 v0.8.1）
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
| **阶段一** | 转换 + 复制 | ✅ **已完成并持续迭代（当前 v0.8.1）** |
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

`<p>`、`<h1>`~`<h6>`、`<strong>`/`<b>`、`<em>`/`<i>`、`<u>`、`<br>`、`<hr>`、`<img>`、`<a>`、`<table>`/`<tr>`/`<td>`/`<th>`、`<ul>`/`<ol>`/`<li>`（但多层嵌套会被微信打乱，插件不再输出，见 8.13）、`<blockquote>`、`<pre>`/`<code>`、`<span>`、`<div>`/`<section>`、`<sub>`/`<sup>`、`<mark>`、`<del>`

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
| `obsidianCalloutPlugin` | `plugins/callout.ts` | `> [!type]` → 带样式 section；`obsidian` 主题下颜色/图标通过 `--callout-color` / `--callout-icon` CSS 变量跟随主题（`normalizeRgbTriplet` 兼容 "r,g,b" 和十六进制两种取值格式），静态主题下走 `setCalloutTheme()` 注入的固定色板；图标用 Lucide SVG（`getIcon()`），输出前统一转成 PNG（见 8.12）；普通 `>` → blockquote（accent 竖线） |
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
| `minimal-mono` | 简约黑白一 | 米白底 + 灰阶标题层级，通用长文阅读排版；代码高亮、callout（4 档灰度区分轻重：危急/警示/中性/平和）、任务列表 checkbox、高亮背景色全部灰阶化，只保留一个克制的墨蓝强调色（链接、`done` 任务打勾），贯彻到底不是只有标题做到了"黑白"；H2 用边框盒子 + 书名号包裹标题（`headingBox` + `quoteMarks`），H1 不带下划线（`noUnderline`） |
| `minimal-mono-2` | 简约黑白二 | 和"简约黑白一"用同一套灰阶代码/callout/任务列表/高亮色板（直接 `{ ...MINIMAL_MONO, ... }` 展开复制再覆盖差异字段），唯一区别是 H2 装饰：不是边框盒子，而是黑底白字、左对齐的实心色块（`headingBar`）——比 `headingBanner`/`headingBox` 都更简单，直接改 `<h2>` 自身的 `background-color`/`color`/`padding`，不额外引入任何包裹元素，是本节这几种标题装饰里理论上风险最低的一种 |
| `warm-almond` | 护眼杏仁 | 暖米黄底 + 棕褐正文，长文阅读、减少眼疲劳 |
| `tech-blue` | 科技蓝 | 冷白/浅灰底 + 靛蓝强调色，科技/商业/金融类账号 |
| `china-red` | 中国红 | 暖白底 + 朱红+金强调色，文化/历史/时评类账号 |
| `forest-green` | 森系绿 | 清新鼠尾草绿，健康/教育/成长类账号 |
| `sakura-pink` | 樱语粉 | 柔和樱花粉，情感/生活方式/女性向账号 |
| `graphite-dark` | 深空灰 | **首款暗色背景主题**，科技数码、深夜阅读 |
| `orange-heart` | 橙心 | 参考"墨滴"同名主题：珊瑚橙 + 墨绿双色，H2 采用色块横幅（`headingBanner`），见下；**不带三角旗**（曾经有，见下） |
| `hardboiled-wonderland` | 冷酷的仙境 | 取名自村上春树《世界尽头与冷酷仙境》。"冷"靠色相而不是深色：标题从深海军蓝到灰蓝都在钢蓝家族里，冰蓝只做点缀（链接、H1 下划线），浅紫收成一点灰紫（疑问/示例 callout、代码关键字）作为"仙境"的痕迹，警告 callout 用冷调黄铜作为唯一的暖色以便醒目；粗体同 H2 的深钢蓝（不和链接同色）；任务列表的进行中/改期/存疑/重要四个状态和同语义的 callout 同色（`taskAccent`），不再用默认的亮蓝/橙/黄/红。H2 是冰晶图标 + 冷灰标签 + 左侧钢蓝竖线（`headingIcon`）。第一版是冰蓝 + 浅紫双强调色、星芒图标配浅紫标签，用户觉得"仙境"有了但缺"冷酷"，重做成现在这样；同时把所有标题/callout 色在白底上的对比度提到约 4.4:1 以上 |

**`StaticTheme` 接口**（`themes.ts`）统一描述一款静态主题的全部色值：`bgPrimary`/`textNormal`/`textMuted`/`textFaint`/`textItalic`/`linkColor`/`accent`/`headings`（H1–H6 六色）/`highlightBg`/`codeBackground`/`borderColor`/`code`（10 个语法高亮 token 色）/`calloutAccent`（13 种 callout 类型强调色）。新增一款主题只需要在 `themes.ts` 里补一份这样的配置对象，`buildStaticThemeMap()` 会自动生成对应的 regex 替换表，其余模块（`callout.ts`/`mermaid.ts`/`math.ts`）都通过 `getStaticTheme(themeId)` 统一查表，不需要逐个文件加 if/else。

**两个可选扩展字段**（目前只有橙心用到）：

- `headingBanner?: { level: 1 | 2; textColor: string; flagColor?: string }`：把指定层级标题从纯色文字换成"色块横幅"——内层 `<span>` 徽标（`display:inline-flex; align-items:center; justify-content:center`，显式 `box-sizing:border-box; height: ${badgeHeight}px`，文字在固定高度盒子里居中）+ 外层 `<h2>` 撑满宽度画 `border-bottom` 通栏细线。徽标只有上面两个角是圆角；带三角旗时右上角也保持直角，好让旗子贴上去。**橙心后来去掉了三角旗**：旗子颜色是接近白色的 `#EEEBE9`，在微信深色模式下效果不好，用户决定不要了。下面这套三角旗机制仍然保留在代码里，配上 `flagColor` 即可重新启用。若配置了 `flagColor`，徽标右侧会再拼一个三角旗：`<img>` 引用一段内联 SVG data URI（三角形多边形 + `preserveAspectRatio="none"`），和 callout 图标是同一招，同样用显式 `height: ${badgeHeight}px`——跟徽标共用**同一个字面量数字**，不再互相"猜"对方的真实高度。**这条前后踩了七次坑**，按顺序记录：
  ① CSS `clip-path` 画三角形——微信粘贴过滤器会剥离 `clip-path`，旗子直接消失；
  ② 换成零尺寸 `<span>` + `border-width`/`border-color` 画三角形——一度以为微信实测过关，但后续补测发现**这招其实整个被微信过滤掉了**（大概率是把"宽高都是 0 的空元素"当垃圾清掉，不管有没有 border），旗子完全不显示；
  ③ 为了让高度自动匹配徽标，先后试了 `<img>`（SVG 只写 `viewBox` 不写 `width`/`height`——浏览器没有声明的内在尺寸，直接退回 UA 默认的 300×150，把徽标撑成大方块）和空 `<span>` 背景图（`background-image` 不参与盒子尺寸计算，`align-self:stretch` 确实能让高度正确拉伸，但背景图这种"按 CSS 加载外部资源"的写法会被微信粘贴过滤器整个丢弃，预览正常、粘贴到公众号后却完全不见）；
  ④ 改回 `<img>` 内容（+ SVG 根节点显式声明 `width`/`height`，避免 UA 默认尺寸），先靠 `align-items:stretch` 拉伸 auto 高度的 `<img>`，后改成让 `<img>` 显式 `height: calc(1.4em + 12px)` 和徽标用同一个公式算高度——Obsidian 预览里两版都对得上，但微信粘贴后旗子和下方分隔线之间始终留有空隙；
  ⑤ 由于零尺寸 border 三角形被证实整个不显示（比"有空隙"更差），退回到 `<img>`（目前为止唯一确认能在微信里显示出东西的技术），不再用 `calc()`，改成 `<img>` 显式纯像素 `height`（单行估算值 + 8px 余量）——微信实测三角旗终于稳定显示、不再有空隙，但徽标本身也被拉高了一截；
  ⑥ 这个意外拉高的结果澄清了一半真相：`align-items:stretch` 在微信里其实是生效的（之前一直以为它失效，其实是 `<img>` 高度本身没算对）。于是按二分法反复微调单行估算值上的余量：+0（漏空隙）→ +5（仍漏）→ +7/+8（不漏但拉高）——每一步都要麻烦用户重新粘贴截图确认，区间越收越窄，但徽标自身的"真实高度"本来就取决于微信替换的字体渲染出的行高，是个我们测不到、只能从外部摸的数字，永远在"差一点点"附近来回震荡；
  ⑦ **真正的修正**：问题不在于怎么猜准三角旗的高度，而在于徽标自己的高度从一开始就是隐式的（`padding` + `line-height` + 不受控制的字体行高）。干脆把徽标也改成显式高度（`box-sizing:border-box` + `inline-flex` 居中文字），这样两个元素共享同一个写死的像素数字，不再有任何一方依赖"猜对方实际渲染出多高"——`align-items:stretch` 也就不再需要了（两者本就等高，换成普通的 `align-items:center`）。
  **现状**：确认能稳定显示三角旗的技术是 `<img>` + 纯像素 `height`（不用 `calc()`/`em`）。代码里三角旗仍然先按 SVG data URI 生成，但输出前会被统一转成 PNG——SVG 图片粘贴后能显示，**保存草稿时会被微信丢掉**，见 8.12。`clip-path`、零尺寸 `border` 三角形、`background-image` 全部已确认在微信粘贴场景下不可靠。高度匹配问题通过"两边都用显式高度、共享同一个字面量数字"解决，不再依赖 `align-items:stretch` 去猜测/追赶一个不受控制的真实渲染高度。
- `headingBox?: { level: 1 | 2; borderColor: string; quoteMarks?: boolean }`：另一种标题装饰——边框盒子（目前简约黑白的 H2 在用）。结构很简单：一个 `<section>` 画 `border` + `background-color`，左右各缩进 20px（`inset`），内含左上角"+"、居中加粗的 `<h${level}>` 标题、右下角"+"（`text-align:left/right` 摆位，不用 `position:absolute`）。标题的 padding 刻意做成上下对称（`1px 20px`），不对称的 padding 会让标题看起来没有垂直居中。全部用 `<section>` 而非 `<div>`——确认过 `<div>` 在微信粘贴时可能连标签带内容一起消失。`quoteMarks: true` 给标题文字两侧加中文书名号「」（简约黑白一在用）——纯文字拼接进标题内容本身，不是额外的标签元素，不会有上面"空标签被微信清掉"那个问题。
- `headingBar?: { level: 1 | 2; bgColor: string; textColor: string }`：另一种标题装饰——实心色块徽标（简约黑白二的 H2 在用）。`<h${level}>` 本身只负责 `text-align:center`，真正的色块是内层包住标题文字的 `<span style="display:inline-block; background-color...">`，这样背景色只贴着文字宽度，不会铺满整行（最早的版本是直接在 `<h2>` 自己身上设 `background-color`，整行铺满、左对齐，用户反馈要改成"居中 + 背景只包文字"后才加了这层 `<span>`）。仍然只有一个额外元素（`headingBanner` 的徽标、`headingBox` 的"+"号也是同样数量级），比那两个更简单的地方在于不需要任何定位/尺寸匹配逻辑，是这几种标题装饰里结构最简单的一种。
- `headingIcon?: { level: 1 | 2; iconSvg: string; textColor: string; textBg: string; barColor?: string }`：图标 + 柔和背景色标签（冷酷的仙境的 H2 在用）。`<h${level}>` 只负责 `display:flex; justify-content:center` 把整个标签居中；真正的标签是内层 `display:inline-flex; align-items:center` 的 `<span>`，背景色挂在**这一层**，`<img>` 图标和标题文字（自己又包了一层 `<span>` 管颜色）都是它的子元素——这样背景色能同时盖住图标和文字（最早的版本背景色只包文字、图标露在外面，用户反馈改成"背景也盖住图标"后才加了这层外层 `<span>`，顺带把 `<h2>` 自己从 `align-items:center` 改成 `justify-content:center` 实现整体居中）。不依赖任何高度匹配/stretch 逻辑（这点和三角旗、票据盒子的教训不一样：图标是固定尺寸，文字是自然高度，`align-items:center` 只是把两者居中对齐，不要求精确等高，风险低很多）。`iconSvg` 只传内部的 path/shape 标记，外层 `<svg viewBox="0 0 24 24">` 由代码统一包裹。参考图里标题左侧是三四个分别定位的彩色小图案（星星/圆点），这里刻意合并成**一个** `<img>`（SVG 内部画多个形状），不是多个分别定位的小元素——这个会话已经反复验证"多个零散定位的装饰小元素"在微信里不可靠，合并成单一 `<img>` 更稳。 可选的 `barColor` 给标签左边加一条 3px 竖线（冷酷的仙境用它做出"切割感"）。
  **曾经有过、后来放弃的设计**：参考截图原本还要求盒子上下各加一条比盒子更宽、朝相反方向偏移的横线（"票据/印章"效果）。这条线只能是空 `<section>`（只有 `border-top`，没有文字内容），实测发现这类纯空标签会被微信的粘贴净化器不可预测地清掉——不是像 `clip-path` 那样每次都稳定剥离，而是随着文档里重复出现的次数增多，丢失情况逐渐变严重（第一个 H2 只丢一条，往后的 H2 两条全丢）。给每条线塞一个不可见文字节点（`&nbsp;` + `color:transparent`，并且这个 `font-size`/`line-height` 必须直接设在 `<section>` 自己身上而不是内部再包一层 `<span>`，否则 `<section>` 会继承外层约 16px/1.75 倍行距撑出一大截空白）试图让它不再是"空标签"，仍然没能解决。用户帮忙跑 Console 脚本转储粘贴后的真实 DOM 确认了这一点，也确认了我们自己生成的原始 HTML 字符串标签闭合完全正常（不是己方 bug）。最终判断这是微信自己对这种重复结构的不稳定处理，不是能靠调整 HTML/CSS 可靠解决的问题，于是去掉这两条线，只保留边框盒子本身——盒子、"+"号、标题文字这些都是本节反复验证过确实稳定的元素。
- `noUnderline?: (1 | 2)[]`：让指定层级的标题彻底不带下划线（既不要 `headingBanner`/`headingBox` 的装饰，也不要默认的 accent 色下划线）。H1/H2 默认都会有一条用 `theme.accent` 上色的 `border-bottom`（parser.ts 占位样式 + 通用替换），简约黑白给 H1 配了这个字段去掉它（H1 用纯文字即可，下划线留给 H2 的票据盒子去做视觉锚点，两级标题都带下划线会太满）。实现上要注意顺序：必须匹配**占位符原文**（`#7c3aed`/`#e5e5e5`）并在 `border-bottom: 2px solid #7c3aed → theme.accent` 这条通用替换之前执行，不然占位色已经被换成主题色，正则就匹配不上了。
- `taskAccent?: { inProgress?; rescheduled?; question?; important? }`：任务列表 checkbox 的填充色，`parser.ts` 里这几种状态一直是硬编码的固定色号（蓝/橙/黄/红），不像标题/callout 那样天生走占位符替换体系——之前没人注意到这几个状态其实不跟随主题，静态主题切换时它们一直是同一套颜色。`done` 不需要这个字段，它恰好复用了 `#7c3aed` 这个和主题 accent 通用替换共享的占位色，本来就跟随主题；`todo` 是空心边框，没有填充色可换。简约黑白给这四个状态配了灰阶值，复用 callout 那套"轻重分级"逻辑（最严重的 `important` 最深）。
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

**所有复制入口输出同一份 HTML**：命令"复制为公众号格式"、右键菜单、预览弹窗和面板的「复制到剪贴板」都直接复制 `ConvertController.convert()` 的结果，预览显示的也是这份 HTML，不再改行高（唯一剩下的预览专用改写是"当前 Obsidian 主题"下的高亮/删除线颜色，见文末）。早期版本里预览弹窗/面板的复制按钮会先把 HTML 里**所有** `line-height` 替换成从阅读视图量出的正文行高，本意是"让复制结果和预览一致"，实际却把标题 1.3、callout 标题 1.5、代码块 1.6、脚注上标和勾选框外层 1 统统改成了正文行高（一篇示例文章里 80 处），导致：同一篇文章从命令复制和从预览按钮复制，粘贴到微信后标题行距不同；而且预览里标题本来按 1.3 显示，从预览按钮复制出去的却是 1.75，预览和微信也对不上。这个替换是多余的：行高需要跟随 Obsidian 的地方（"当前 Obsidian 主题"下的段落和列表行），`StyleEngine` 已经把 `--line-height-normal` 写进了输出；静态主题本来就用主题自己的行高。预览里那段把段落/列表行改成阅读视图行高的代码也一并删除。`readThemeVars()` 现在只读"当前 Obsidian 主题"下预览用的高亮/删除线颜色——这一项仍然只作用于预览，复制出去的是引擎读到的颜色，两者通常相同，但不保证。

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
│   │   ├── themes.ts                  # 静态主题注册表（11 款预设）+ 主题色值→regex 替换表生成
│   │   ├── color-utils.ts             # mixColors / hexToRgbTriplet / normalizeRgbTriplet
│   │   ├── task-icons.ts              # 任务列表勾选框 <span> → 图片（主题配色之后）
│   │   ├── live-task-icons.ts         # "当前 Obsidian 主题"：截取 Obsidian 实际渲染的勾选框（Electron capturePage）
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
│       ├── mime.ts                    # 文件扩展名 → MIME 类型
│       └── svg-raster.ts              # SVG → PNG（Mermaid 共用；输出前把 SVG 图片统一转 PNG、小 PNG 补到 2KB）
├── styles.css                         # 插件 UI 样式（预览弹窗等）
├── manifest.json                      # 版本 0.8.1
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

**H1–H6 下划线跟随真实主题**：`parser.ts` 给 H1/H2 输出的是占位样式（含占位 `border-bottom`），早期 `engine.ts` 在 `obsidian` 实时主题下统一把这个占位下划线删掉，理由是"大多数主题标题只用颜色区分层级，硬编码的下划线放别的主题下会显得突兀"——但这个判断是**无条件的**，不管用户当前主题实际有没有下划线都会删，于是出现"当前 Obsidian 主题 H1 明明带下划线，但预览里却没有"的不一致。H3–H6 原本连占位 `border-bottom` 都没有（parser.ts 从未支持过），用户确认也想要同样的跟随行为后一并补上。
修复为 `readHeadingBorder(level, fallbackPaddingBottom)`：和 `readHeadingColor` 同样的 element-injection 手法，往预览区域临时插入真实的 `<h1>`–`<h6>`，用 `getComputedStyle()` 读 `border-bottom-width/style/color` 和 `padding-bottom`。真实主题有下划线（宽度非 0 且 style 不是 `none`，`dashed`/`dotted` 等非 `solid` 样式也能识别）就原样跟随；没有就回退到整条删除，不强行套用占位值。H3–H6 新增的占位 `border-bottom`（`#a1a1a1`–`#a4a4a4`，仅用于被 `engine.ts` 探测替换，不会真实显示）在静态主题（`themes.ts` 的 `buildStaticThemeMap`）里一律无条件删除，因为目前 9 套预设都没有 H3–H6 下划线的设计。已知局限：只能捕获标题元素自身字面的 `border-bottom`，如果某个主题是靠 `::after` 伪元素或 `box-shadow` 画下划线，这种探测方式读不到，会回退成"无下划线"。

### 8.3 代码高亮颜色

Parser 输出 GitHub Light 配色（hardcoded 颜色值）。StyleEngine 的 `applyObsidianOverrides` 将这些颜色替换为两套 Tokyo Night 配色（Day/Storm），具体选哪套由 `document.body.classList.contains('theme-dark')` 决定。

**代码块空白**：微信粘贴时不理会 `<pre>` 上的 `white-space: pre`，会按普通网页规则压缩空白——夹在两个高亮 `<span>` 之间的单独空格（`def` 和 `hello_world` 之间）、行首缩进都会消失，而夹在普通文字中间的空格能保留。所以 `parser.ts` 的 `preserveCodeWhitespace()` 在高亮完成后，把代码里标签之外的文字中的空格换成 `&nbsp;`、制表符换成 4 个 `&nbsp;`、换行换成 `<br>`（去掉末尾换行），不再依赖 `white-space`。所有围栏代码块（带不带语言标记）都走这个 `highlight` 回调，一处覆盖。代价：读者从公众号复制代码时，空格会是不换行空格（`U+00A0`），个别编辑器里可能需要替换，这是公众号代码块的普遍做法。

### 8.4 图片路径含空格

markdown-it 渲染 `![alt](path with spaces)` 时会 URL 编码空格，导致 `vault.getAbstractFileByPath()` 找不到文件。

解决方案：`preprocessor.ts` 直接生成 `<img src="..." style="...">` HTML 标签（而非 markdown 语法），markdown-it 的 `html: true` 选项将其透传，图片规则不再触发 URL 编码。

### 8.5 同名文件消歧

按文件名全局搜索时，如果找到多个同名文件，`embedder.ts` 记录警告并跳过（不随机选一个），提示用户在 `![[]]` 中使用完整相对路径。

### 8.6 任务列表实现

任务项和普通列表项一样是一行 flex `<section>`（见 8.13）：左侧固定宽度的标记列放勾选框，右侧 `flex: 1` 内容区。支持 7 种任务状态，下表是默认配色；`[x]` 跟随主题强调色，静态主题可用 `taskAccent` 覆盖进行中/改期/存疑/重要四种：

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

**勾选框最终输出为图片**：`parser.ts` 先把勾选框输出成带 `data-pub-task` 标记、带内联背景色/边框色的 `<span>`（这样各主题仍能用占位符替换给它上色），`StyleEngine.process()` 在主题替换之后、`sanitizeForWeChat()` 删掉 `data-*` 之前，由 `taskBoxesToImages()`（`src/style/task-icons.ts`）把它换成一个 15×15 的 SVG `<img>`：圆角方块 + 用路径画的白色符号（不用文字字形）；之后和其它 SVG 图片一样被转成 PNG、补足体积（见 8.12）。原因：用 `<span>` 的时候，粘贴进微信后未勾选的空心框（没有任何文字的空标签）整个消失，其它框里的符号被挤到顶部、被切掉一半（微信改动了小方块里的行高排版），而 Obsidian 预览一切正常。对齐方式：图片放在一个正文字号（16px）的 `inline-block` 小容器里、`vertical-align: -2px`（图片底边比文字基线低 2px，正好让 15px 方块的中心对准大写字母高度的中线），容器末尾带一个 `&nbsp;` 提供文字基线（兼作间距），列表行用 `align-items: baseline` 把这个容器和任务文字按基线对齐。这样勾选框始终跟着文字走，与行高无关。第一版用 `align-items: flex-start` + 固定 `margin-top: 4px`，按 Obsidian 的行高算好；粘贴进公众号后行高被"行间距"放大，文字下移而勾选框不动，看起来偏高（预览里原本还有一段按主题行高动态算 `margin-top` 的代码，也一并删掉了）。在预览里把行高强行放大到 2.8 倍验证过，偏差不变。第二版用的是 `vertical-align: middle`，但 `middle` 对准的是小写字母 x 高度的中线，比人眼感受到的文字中心（英文标题以大写字母开头、多有 l/t/k 这类高笔画）低 1～2px，用户目测"图标略低"；改成按基线下沉固定像素，量得图标中心与大写字母中线的偏差约 0.2px。callout 标题图标（`callout.ts` 的 `buildIconImg`）有同样的问题，同样从 `middle` 改成了 `vertical-align: -3px`（16px 图标、15px 标题字），偏差约 0.4px。

**"当前 Obsidian 主题"下的勾选框直接截取 Obsidian 的实际渲染**（`src/style/live-task-icons.ts`）：各 Obsidian 主题画勾选框的手法五花八门（圆形/方形、`::before` 文字符号、`mask-image` 遮罩、半填充色块……），逐个解读 CSS 去复刻不现实。插件是桌面版，Obsidian 桌面端开放了 Electron 的 `remote.getCurrentWebContents().capturePage()`：转换时在页面左上角临时放一个和阅读视图同结构的 `.markdown-preview-view.markdown-rendered > ul.contains-task-list > li.task-list-item[data-task]` 探针，7 种状态各一个真实的 `<input type="checkbox">`，排成一行，按 `webFrame` 缩放系数换算坐标，**整行只截一张**（Retina 下是 2 倍像素），再在 canvas 里按各勾选框的位置裁开。截图会带上背景，所以要在两种已知背景上各截一次，按 alpha = 1 −（截图1 − 截图2）/（背景1 − 背景2）、颜色 =（截图1 −（1 − alpha）× 背景1）/ alpha 逐像素算出透明 PNG。两种背景用探针自己的阅读视图背景色，以及同一颜色每个通道偏移 64 级（浅色主题往深、深色主题往浅）——相差 64 级算透明度已经足够精确。

第一版是 7 个勾选框各截一张、背景用纯白和纯黑，一共 14 张截图，探针在屏幕上停留约 120ms，用户看到的是左上角先闪一块白、再闪一块黑。现在只截 2 张，停留约 25–30ms（两帧左右），第一张看起来只是几个勾选框出现了一下，第二张背景只是略深或略浅，不再有黑白块。探针必须真的显示在屏幕上（截图只能截到屏幕上实际显示的内容），所以这一下闪现无法完全去掉；完全不闪要用离屏窗口渲染，但那需要把 Obsidian 的全部主题样式搬过去，没有采用。结果按 Obsidian 主题/深浅模式缓存，`css-change` 事件（换主题、切深浅色、开关 CSS 片段）时作废，所以只有之后第一次转换会闪现。截不到（拿不到 Electron 接口、窗口最小化等）就退回插件自己画的勾选框。截下来的图片直接作为 `taskBoxesToImages()` 的输入，尺寸用实际渲染尺寸（含 1px 边距），对齐偏移按图片高度换算（`CAP_CENTER − h/2`），保证不同尺寸的勾选框都对准文字的大写字母中线。静态预设主题仍用插件自己画的勾选框。

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

### 8.10 深色主题（深空灰）整页背景色粘贴到微信后丢失

预览里深色背景正常，复制到微信公众号后背景色却不见了——但 callout、代码块、表头这些内部元素的背景色却都能正常保留。原来 `StyleEngine.process()` 用 `<div>` 包裹全部内容，背景色挂在这个最外层 div 上（`engine.ts` 的 `getWrapperStyle()`）。

第一次诊断猜测是"粘贴片段根节点的样式不会生效"，于是把单层 `<div>` 改成两层——结果用户实测仍然没有背景色，这个猜测被推翻了。

**实际诊断方式**：与其继续猜测，直接让用户在微信编辑器粘贴后，打开浏览器 Console 跑一段脚本（`document.querySelectorAll('[style*="background-color"]')`），把粘贴后 DOM 里所有带 `background-color` 的元素连同标签名一起转储出来比对。结果非常清楚：我们生成的 `<mark>`、`<code>`、`<pre>`、`<th>`、`<section>`（callout）背景色全部完好，颜色都对得上；但唯独没有任何元素带着我们整页背景色的值（`rgb(30, 33, 36)`）——而且两层 `<div>` 都没有保留下来，证实不是"根节点"的问题，而是 **`<div>` 这个标签本身在微信的粘贴解析里被处理掉了**（不只是丢样式，连标签一起消失），`<section>` 则不会。

修复：把最外层包裹容器从 `<div>` 换成 `<section>`（`engine.ts` 的 `process()`），不再需要套两层——用对标签比套娃更管用。

**经验**：这类问题靠在 Obsidian 里反复试错效率很低，因为预览环境和微信真实粘贴环境本来就不是同一套渲染/净化逻辑；直接从用户那边拿到粘贴后的真实 DOM 数据（哪怕只是一段简单的 Console 脚本转储），比纯靠猜测再一轮轮验证快得多，也更准。

### 8.11 部分主题不带正文背景色（"当前 Obsidian 主题"浅色模式、橙心、冷酷的仙境）

用户要求"当前 Obsidian 主题"复制到公众号时不带正文背景色，交给微信自己决定——Obsidian 浅色主题的背景常常是略带灰/暖调的浅色，贴到公众号白底上会变成一块和周围不一样的色块。但这个主题的文字颜色是从 Obsidian 实时读的：**深色模式下读到的是浅色文字**，如果也去掉背景，贴到公众号默认白底上就看不清了（和讨论"深空灰"要不要透明背景时是同一个道理）。所以只在**浅色模式**下去掉：`getWrapperStyle()` 根据 `ObsidianVars.isDark`（`body.theme-dark`，读变量时一并记下）决定是否输出 `background-color`，深色模式照旧带上 `--background-primary`（用户专门试过深色模式也去掉背景、粘贴到微信实测，确认浅色文字确实看不清，已回退）。

静态预设主题默认仍然输出自己的背景色（背景是主题设计的一部分），但可以用 `transparentPage: true` 关掉——之后用户要求橙心和冷酷的仙境也不带背景色，就给这两个打开了。只适合浅色主题：去掉后正文直接落在公众号白底上，文字必须在白底上也清晰。`bgPrimary` 仍然保留，内部用来计算 callout 底色等；Mermaid 图表虽然也用 `bgPrimary` 做配色基准，但导出的 PNG 背景本身是透明的，去掉页面背景后不会出现一块带底色的矩形（已在预览里确认）。

配套改了预览框：底色**跟随内容自身的背景色**——`applyPreviewContent()`（`preview-renderer.ts`，弹窗和面板共用）读根 `<section>` 的内联 `background-color`，有就设到预览框上，没有就清掉、退回 `styles.css` 里的白色（模拟公众号文章页）。第一版是预览框一律固定白色，深色模式/静态主题的内容外面就露出一圈白边（预览框 `padding` 那一圈），用户觉得像 bug——虽然严格说那是"贴到白底公众号页面上"的样子，但公众号自己也可能在深色模式，白边并不总是真实效果，所以改成跟随内容。

### 8.12 图片在保存草稿时被微信丢掉（SVG、小于约 1KB）→ 统一转 PNG 并补足体积

之前一直以为 `<img src="data:image/svg+xml,...">` 在微信里"稳定可靠"（callout 图标、橙心三角旗、冷酷的仙境 H2 图标都靠它），因为粘贴进编辑器后确实能显示。后来用户发现：**粘贴后能看到，但一保存草稿就没了**——三角旗、所有 callout 标题图标都消失。推测是保存时微信服务器会把文章里的内嵌图片转存到自己的图床，而转存只认位图格式（PNG/JPG/GIF），SVG 转存不了就被删掉。数学公式、Mermaid、本地图片本来就是 PNG，所以一直没出问题。

修复：`convert()` 的最后一步加了 `rasterizeSvgImages()`（`src/utils/svg-raster.ts`），把输出 HTML 里所有 SVG data URI 的 `<img>` 在本地转成 PNG data URI——按 `<img>` 的显示尺寸（内联 style 的 px → `width`/`height` 属性 → SVG 根节点自己的尺寸，依次取）乘 2 倍渲染，`<img>` 的其它属性和样式原样保留，显示尺寸不变；相同图标只渲染一次。转换失败就保留原 SVG（至少编辑器里还能看到）。生成三角旗/图标的代码本身不用改，仍然先写 SVG，最后统一转。SVG→画布→PNG 这一段原本写在 Mermaid 里，抽成了共用的 `rasterizeSvg()`，Mermaid 也改用它。

**转成 PNG 之后还不够——小于约 1KB 的图片也会被丢**：转 PNG 后用户再保存草稿，callout 图标只剩 Information、Todo、Question 三个，三角旗仍然没了。量了一下各图标 PNG 的文件大小：留下来的三个正好最大（1122–1230B），其余都在 1KB 以下（400–999B），三角旗是纯色三角形，压缩后只有约 620B；而它们的像素尺寸全是一样的 32×32。所以推测微信保存时会把小于约 1KB 的图片当成追踪像素之类的垃圾图片删掉。修复：`padSmallPngs()`（同在 `svg-raster.ts`）在输出最后一步检查所有 PNG data URI，小于 2KB 的在 IEND 之前插入一个填充空格的 `tEXt` 注释块（自己算 CRC32），把文件撑过门槛，像素完全不变。这一步对所有 PNG 生效，所以很短的行内数学公式图片（同样可能小于 1KB）也一起被覆盖了。用户保存草稿实测确认：补足体积后三角旗和全部 callout 图标都保留了下来——像素没变、只改了文件大小就修好，也反过来证实了"按文件大小丢弃"这个推测。

**教训**：微信"粘贴后能显示"不等于"能发布"。粘贴时编辑器只是渲染这段 HTML；保存草稿时服务器还会再处理一遍，有些东西是在这一步才被丢掉的。以后验证微信兼容性，要**保存草稿后再看**，不能只看粘贴后的编辑器。

---

### 8.13 列表不用 `<ul>`/`<ol>`/`<li>`，改成插件自己画的 `<section>` 行

**问题**：三层嵌套的无序列表粘贴进公众号后结构被打乱——第 3 层的项被提到第 2 层，还挪到了同级各项的最前面。插件生成的 `<ul>` 嵌套是正确的（转储过 HTML 确认），是微信粘贴时重新整理列表造成的。另外微信里的列表符号用的是浏览器自带样式：颜色与正文相同、第 2 层变成空心圆、没有缩进线，和预览不一致——预览之所以"对"，是因为预览区在 Obsidian 页面里，Obsidian 的全局 CSS（`ul > li::marker { color: var(--list-marker-color) }`、嵌套 `ul` 一律 `disc`）顺带作用到了它上面，这些 CSS 不会跟着复制出去。紧凑列表还多出了 `<p>`（自定义的 `paragraph_open` 规则没理会 markdown-it 的 `hidden` 标记），预览里靠 `styles.css` 的 `li p { margin: 0 }` 掩盖，微信里却多出段落间距。

**做法**（`parser.ts` 的列表渲染规则）：
- 每个列表是一个 `<section>`，每一项是一行 flex `<section>`：左边 32px 宽的标记列 + 右边 `flex: 1` 的内容 `<section>`，按基线对齐。标记列里放圆点 `•`（居中在 19px 处）、有序序号（右对齐，与正文间隔 6px）或任务勾选框。圆点和序号是**文字字符**，不用空标签画（空标签在微信里会丢）。
- 嵌套列表在父项的内容列里，用 `margin-left: -13px` 退回到父项标记的中心，`border-left: 1px` 画缩进线、`padding-left: 12px` 把内容推回原位。几何尺寸和 Obsidian 阅读视图一致（正文距左 32px、圆点中心 19px、缩进线在父级圆点正下方）。
- 颜色用占位符：`#b0b0b1` 标记色、`#c0c0c1` 缩进线色。"当前 Obsidian 主题"分别读 `--list-marker-color`、`--indentation-guide-color`（后者通常是半透明色，按透明度混合到页面背景色上，得到不透明的颜色）；静态主题用 `textFaint`、`borderColor`。
- 序号由解析器自己数（列表栈记录有序与否和下一个序号，支持 `start`）。
- 紧凑列表的段落标记为 `hidden` 时不输出 `<p>`；列表里的段落去掉下边距。

**配套删除**：`styles.css` 里预览专用的列表缩进线（`li > ul::before`）和 `li p` 规则、`preview-renderer.ts` 里读取主题缩进线/列表边距并改写 `<li>` 的代码都删掉了——这些只作用于预览，导致预览和微信不一致。现在预览看到的就是复制出去的结构。（预览给段落、列表行改行高的代码后来也删了，见下面"所有复制入口输出同一份 HTML"。）

**代价**：粘贴到公众号后不再是编辑器认的"列表"，在微信里按回车不会自动续出新的列表项。

## 9. 已知限制与风险

| 限制/风险 | 说明 | 应对 |
|-----------|------|------|
| 外部图片不稳定 | 微信编辑器抓取外部图片行为不稳定 | 建议使用本地图片或图床 |
| base64 图片体积 | 大量图片导致 HTML 过大 | 未来可加图床上传选项 |
| 主题替换表维护 | parser.ts 输出的 hardcoded 占位色值 ↔ engine.ts/themes.ts 的 regex 替换表之间是隐式契约 | 修改 parser 样式时须同步检查占位色是否被下游正确捕获；新增静态主题本身已通过注册表模式免于逐文件改 if/else |
| 微信过滤规则变化 | 新版微信编辑器可能调整过滤规则 | 每次更新后回归测试 |
| Mermaid 颜色精确度（`obsidian` 主题） | 实时主题下仍用 Mermaid 内置 dark/default 主题，不完全匹配 Obsidian 当前主题配色 | 静态主题已通过 `buildMermaidInit()` 用主题自身色值映射 themeVariables，只有 `obsidian` 实时模式待改进 |
| 橙心 callout 是固定色板 | 早期实现过"跟随当前 Obsidian 主题实时变化"，后按用户要求改回固定色板（专门设计、区分 13 种类型、统一橙心自己的暖色家族），不再联动 Obsidian 主题 | 属于确认过的设计决策，非 bug；如需恢复实时联动可参考 8.8 提到的 `readCalloutStyle` 实时读取路径 |
| 微信编辑器"行间距"全局设置会放大我们的 `line-height` | 微信公众号编辑器工具栏有一个全局"行间距"倍数设置，新建文章默认是 1.6 倍，会在我们自己设置的 `line-height` 基础上再乘一层——这不是我们粘贴内容自带的 CSS，是编辑器本身的文章级设置，粘贴进来的内容也会被套用。简约黑白 H2 票据盒子（`headingBox`）这类"文字行紧密堆叠"的设计对这个放大效应特别敏感，表现为盒子在微信里比 Obsidian 预览明显偏高——这很可能也是本节其它"预览正常、微信里偏高"问题背后的部分成因 | 用户实测确认：粘贴后把微信编辑器工具栏的"行间距"手动调成 1.0，高度就恢复正常。这是编辑器级别的全局设置，不是我们能通过调整生成的 HTML/CSS 覆盖掉的（除非反向猜一个固定倍数去抵消，但这个倍数既不保证所有账号/文章一致，也会让 Obsidian 预览跟着跑偏，权衡后选择了"粘贴后手动调一次"这个更稳妥的工作流方案，没有在代码里做任何针对性补偿） |

---

## 10. 开发路线图

### 阶段一：基础转换（✅ 已完成并持续迭代，当前 v0.8.1）

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
  - 橙心主题的色块横幅标题（`headingBanner`）；三角旗机制已实现但橙心已不再启用（微信深色模式下效果不好），详见 4.3
  - 预览弹窗/预览面板均可直接切换主题，无需前往设置页
- [x] 数学公式（`$...$` / `$$...$$`，MathJax CHTML + html2canvas，编辑/阅读模式均支持，iframe 隔离批量渲染，2x PNG）
- [x] Mermaid 图表（MarkdownRenderer offscreen → SVG → Canvas 2x PNG，深/浅色模式自动切换，静态主题按自身色值映射 themeVariables，fallback 样式化文本块）
- [x] 高亮文字颜色跟随主题（同时读取 `<mark>` 的 backgroundColor 和 color）
- [x] 预览弹窗（显示的就是复制出去的 HTML，不做预览专用改写；标题栏可拖拽；主题切换器）
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

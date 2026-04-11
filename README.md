# Obsidian Publisher

将 Obsidian 文档转换为微信公众号兼容的富文本格式，一键复制到剪贴板，粘贴后保留完整排版样式。

## 功能

### 核心转换（已验证）

- **一键复制**：将当前 Markdown 文档转换为带内联样式的 HTML，写入剪贴板的 `text/html` 格式
- **预览弹窗**：模拟手机宽度（375px）预览效果，支持预览后再复制

### Obsidian 语法支持

| 语法 | 转换结果 | 状态 |
|------|----------|------|
| `[[WikiLink]]` | 纯文本 | ✅ 已验证 |
| `==高亮==` | `<mark>`，颜色跟随主题 | ✅ 已验证 |
| `~~删除线~~` | `<del>` | ✅ 已验证 |
| `- [ ]` / `- [x]` 任务列表 | CSS 绘制的方框/勾，样式跟随主题 | ✅ 已验证 |
| `> [!note]` Callout 块 | 带样式的 div | ✅ 已验证 |
| 代码块 | 语法高亮（Tokyo Night 配色） | ✅ 已验证 |
| `[^1]` 脚注 | 上标引用 + 底部定义区（微信兼容，无锚链接） | ✅ 已验证 |
| Frontmatter | 自动移除 | ✅ 已验证 |
| `#tag` 标签 | 自动移除 | ✅ 已验证 |
| `![[image.png]]` | 图片（支持宽度限制 `![[img.png\|300]]`） | ✅ 已验证 |
| `![[note.md]]` | 内联展开被嵌入的笔记（最大递归深度 3） | ✅ 已验证 |

### 主题适配

插件在转换时从当前 Obsidian 主题读取实际 CSS 变量，预览和输出样式跟随主题自动适配：

- 文字颜色、背景色、强调色
- 代码块背景、高亮颜色
- 任务列表 checkbox 形状（方形/圆形）、边框宽度、完成状态颜色
- Callout 配色
- 斜体颜色
- 高亮背景色

已测试主题：**Blue Topaz**、**Minimal**、**Default**

输出模式（设置中可选）：
- `obsidian`：跟随当前 Obsidian 主题（推荐）
- `minimal`：简约黑白风格，适合对排版要求低的场景

## 安装（开发模式）

```bash
# 1. 克隆并安装依赖
cd obsidian-publisher
npm install

# 2. 构建（生产）
npm run build

# 3. 开发模式（自动监听修改）
npm run dev

# 4. 软链接到你的测试 vault
ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/obsidian-publisher
```

然后在 Obsidian：**设置 → 第三方插件 → 关闭安全模式 → 启用 Obsidian Publisher**

## 使用

1. 打开一篇 Markdown 文档
2. `Ctrl/Cmd + P` → 搜索"复制为公众号格式"，或点击左侧 ribbon 图标
3. 可选：先用"预览公众号效果"命令在弹窗中检查样式
4. 打开微信公众号编辑器，`Ctrl+V` 粘贴

## 支持的代码语言

JavaScript / TypeScript、Python、Java、Go、Rust、C++、CSS、HTML / XML、Bash、SQL、JSON、YAML

## 已知限制

- **图片**：本地图片转为 base64 嵌入，粘贴后微信编辑器会自动处理；外部图片依赖微信抓取，行为不稳定
- **数学公式**：暂不支持（KaTeX → SVG/PNG 为未来计划）
- **Mermaid 图表**：暂不支持（离屏渲染为未来计划）

## 开发路线图

- [x] 阶段一：Markdown 转换 + 剪贴板复制
  - [x] 核心 Obsidian 语法（WikiLink、Callout、高亮、删除线、任务列表）
  - [x] 代码块语法高亮
  - [x] 脚注支持（WeChat 兼容）
  - [x] 主题颜色跟随（Blue Topaz / Minimal / Default 验证）
  - [x] 图片嵌入（本地图片 base64 嵌入，支持宽度限制）
  - [x] 笔记嵌入（`![[note.md]]` 内联展开，最大递归深度 3）
- [ ] 阶段二：微信公众号 API 自动发布（草稿上传）
- [ ] 数学公式（KaTeX → SVG/PNG）
- [ ] Mermaid 图表（离屏渲染 → PNG）
- [ ] 图床上传（SM.MS / 阿里云 OSS 等）

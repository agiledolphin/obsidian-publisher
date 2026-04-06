# Obsidian Publisher

将 Obsidian 文档转换为微信公众号兼容的富文本格式，一键复制到剪贴板，粘贴后保留完整排版样式。

## 功能

- **一键复制**：将当前 Markdown 文档转换为带内联样式的 HTML，写入剪贴板的 `text/html` 格式
- **Obsidian 语法支持**：
  - `[[WikiLink]]` → 纯文本
  - `![[image.png]]` → 图片（自动 base64 嵌入本地图片）
  - `![[note.md]]` → 内联展开被嵌入的笔记（最大递归深度 3）
  - `> [!note]` Callout 块 → 带样式的 div
  - `==高亮==` → `<mark>`
  - `~~删除线~~` → `<del>`
  - `- [x]` 任务列表 → ✅ 勾选样式
  - 代码块 → 语法高亮（GitHub 风格配色，内联样式）
  - Frontmatter → 自动移除
- **多主题**：Obsidian Light（默认）、Obsidian Dark、简约
- **预览弹窗**：模拟手机宽度（375px）预览效果

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
3. 打开微信公众号编辑器，`Ctrl+V` 粘贴
4. 可选：先用"预览公众号效果"命令在弹窗中检查样式

## 支持的语言高亮

JavaScript/TypeScript、Python、Java、Go、Rust、C++、CSS、HTML/XML、Bash、SQL、JSON、YAML

## 开发路线图

- [x] 阶段一：Markdown 转换 + 剪贴板复制
- [ ] 阶段二：微信公众号 API 自动发布（草稿上传）
- [ ] 数学公式（KaTeX → SVG/PNG）
- [ ] Mermaid 图表（离屏渲染 → PNG）
- [ ] 图床上传（SM.MS / 阿里云 OSS 等）

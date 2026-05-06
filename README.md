# MD Annotate

非侵入式 Markdown 批注系统——通过伴随元数据文件在 Markdown 上添加评论和笔记，不修改原始文档。

## 功能

- **批注模式**：在编辑器右上角点击按钮进入可视化批注界面，选中文本右键即可添加批注
- **源码模式装饰**：在普通 Markdown 编辑视图中，被批注的行会显示 💬/🤖 图标
- **侧边栏面板**：在资源管理器中查看当前文件的所有批注
- **右键菜单**：选中文本后右键 → "添加批注"
- **命令面板**：通过命令面板添加/删除/切换解决状态
- **AI 批注支持**：通过独立的 `.ai-annotations.json` 文件，AI 可以对文档进行标注
- **非侵入**：所有批注存储在 `.annotations.json` 文件中，Markdown 源文件不会有任何改动

## 安装

### 从 VSIX 安装（推荐）

1. 下载 `.vsix` 文件（见 Releases 或自行打包）
2. VSCode 中：扩展面板 → `...` → "从 VSIX 安装"

### 从源码开发

```bash
git clone https://github.com/XiaoLinXiaoZhu/md-annotate
cd md-annotate
bun install
bun run compile
```

按 F5 在 Extension Development Host 中运行。

### 打包

```bash
bun run compile
npx @vscode/vsce package --no-dependencies
```

生成 `md-annotate-x.x.x.vsix`，可分发给他人安装。

## 使用

1. 打开一个 `.md` 文件
2. 选中文本 → 右键 → "添加批注"，或使用编辑器右上角的 💬 按钮进入批注模式
3. 批注信息保存在同目录的 `<filename>.annotations.json` 中

## 元数据格式

```json
{
  "version": "1.0",
  "source": "notes.md",
  "author_type": "human",
  "annotations": [
    {
      "id": "ann_abc123",
      "anchor": {
        "type": "text-range",
        "start_text": "被批注的文本开头",
        "end_text": "被批注的文本结尾"
      },
      "content": "批注内容",
      "created_at": "2025-01-01T00:00:00.000Z",
      "resolved": false,
      "tags": ["todo"]
    }
  ]
}
```

### Anchor 类型

| 类型 | 字段 | 说明 |
|------|------|------|
| `text-range` | `start_text`, `end_text`, `paragraph_index?` | 按文本内容定位 |
| `line-range` | `start_line`, `end_line` | 按行号定位 |
| `heading` | `heading_text`, `heading_level?` | 按标题定位 |

## 配置

| 选项 | 值 | 说明 |
|------|------|------|
| `mdAnnotate.metadataLocation` | `"same-directory"` \| `".annotations"` | 元数据存放位置 |

## Agent 使用说明

AI agent 可以通过 `jq` 操作 `.ai-annotations.json` 文件来对文档进行批注：

```bash
# 读取所有批注
jq '.annotations' notes.ai-annotations.json

# 添加一条批注
jq '.annotations += [{"id":"ann_'$(date +%s)'","anchor":{"type":"text-range","start_text":"目标文本","end_text":"目标文本"},"content":"AI 的评论","created_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","resolved":false,"tags":[]}]' notes.ai-annotations.json > tmp && mv tmp notes.ai-annotations.json

# 标记某条批注为已解决
jq '(.annotations[] | select(.id == "ann_xxx")).resolved = true' notes.ai-annotations.json > tmp && mv tmp notes.ai-annotations.json
```

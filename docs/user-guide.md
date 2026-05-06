# MD Annotate — 使用说明

## 这是什么？

MD Annotate 是一个 VSCode 插件，让你在不修改 markdown 文件本身的情况下，对文本添加批注、评论和标记。所有批注数据保存在伴随的 `.annotations.json` 文件中，原始 markdown 保持干净。

## 核心概念

### 非侵入式批注

你的 markdown 文件永远不会被修改。批注数据存储在旁边的 metadata 文件中：

```
my-doc.md                    ← 你的文档（不会被动）
my-doc.annotations.json      ← 人类批注
my-doc.ai-annotations.json   ← AI 批注（可选）
```

### 锚定方式

批注通过三种方式"附着"到文档上：

| 方式 | 适用场景 | 稳定性 |
|------|---------|--------|
| `text-range` | 选中一段文字 | 高（文字不变就能定位） |
| `line-range` | 按行号标记 | 低（行号会随编辑变化） |
| `heading` | 标记某个标题 | 高（标题文字通常稳定） |

## 如何使用

### 添加批注

1. 打开一个 `.md` 文件
2. 选中你想批注的文本
3. 右键菜单 → **Add Annotation**
4. 在弹出的输入框中写下你的批注
5. 完成！批注自动保存到 metadata 文件

### 查看批注

- 编辑器中被批注的文本旁会显示 💬 图标
- 点击右上角的 💬 按钮打开批注面板
- 面板中显示所有批注，按时间倒序排列

### 管理批注

- **标记为已解决**：在批注面板中点击 ✓ 按钮
- **删除批注**：命令面板 → `Remove Annotation` → 选择要删的
- **切换解决状态**：命令面板 → `Toggle Resolved`

### 配置选项

在 VSCode Settings 中搜索 `mdAnnotate`：

- **metadataLocation**：metadata 文件存放位置
  - `same-directory`（默认）：与 md 文件同目录
  - `.annotations`：放在隐藏的 `.annotations/` 子目录中
- **enableAiAnnotations**：是否启用 AI 批注文件

## 与 AI 协作

当 `enableAiAnnotations` 开启时，AI agent 可以通过直接编辑 `.ai-annotations.json` 文件来添加反馈。这些批注在面板中以 🤖 图标显示，与人类批注视觉区分。

典型协作流程：
1. 你写文档，添加人类批注标记待讨论的点
2. AI 读取你的批注，在 AI 批注文件中回应
3. 你查看 AI 的回应，标记已解决的或继续讨论

## 与版本控制配合

`.annotations.json` 文件是纯 JSON，对 git 友好：
- 可以 commit 到仓库中共享批注
- 也可以加入 `.gitignore` 保持私有
- 合并冲突时可以用 jq 辅助解决

## FAQ

**Q: 如果我修改了 markdown 内容，批注会丢失吗？**

A: 不会丢失，但可能无法正确定位。`text-range` 类型的锚定依赖文本内容匹配，如果锚定的文本被修改了，批注会退回到 `paragraph_index` 备用定位。

**Q: 支持多人协作吗？**

A: 目前每种 author_type 一个文件。多人场景可以通过 git 合并，或未来支持以 author_name 区分。

**Q: 能导出批注吗？**

A: metadata 文件本身就是结构化的 JSON，可以直接用脚本处理。参见 Agent 使用说明书中的 jq 示例。

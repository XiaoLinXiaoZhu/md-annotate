# MD Annotate

非侵入式 Markdown 批注系统 —— 在不修改原文的情况下，为 markdown 文件添加评论、标记和协作信息。

## 项目结构

```
md-annotate/
├── src/                    # VSCode 插件源码
│   ├── extension.ts        # 插件入口
│   ├── annotationStore.ts  # 读写 metadata JSON
│   ├── webviewProvider.ts  # 侧栏批注面板
│   ├── commands.ts         # 命令注册（添加/删除/切换批注）
│   ├── decorations.ts      # 编辑器内装饰（💬 图标、悬浮提示）
│   └── types.ts            # TypeScript 类型定义
├── schema/
│   └── annotations.schema.json  # JSON Schema 定义
├── docs/
│   ├── user-guide.md       # 人类使用说明
│   └── agent-guide.md      # AI Agent 使用说明（含 jq 示例）
├── sample/                 # 示例文件
│   ├── example.md
│   ├── example.annotations.json
│   └── example.ai-annotations.json
├── package.json            # VSCode 插件 manifest
└── tsconfig.json
```

## 快速开始

```bash
cd md-annotate
bun install        # 或 npm install
npx tsc -p ./     # 编译
```

然后在 VSCode 中按 F5 启动 Extension Development Host 测试。

## 核心设计

1. **非侵入**：所有批注数据存储在 `.annotations.json` 伴随文件中，原始 md 不受影响
2. **双通道**：人类和 AI 各有独立的 metadata 文件，互不干扰
3. **多种锚定**：支持文本片段匹配、行号范围、标题定位三种方式
4. **CLI 友好**：JSON 格式对 jq 等工具天然友好，AI agent 可直接读写

## 使用场景

- 文档 review：在不改动原文的情况下添加审阅意见
- 任务追踪：用批注标记待办事项、进度、优先级
- AI 协作：AI 通过 metadata 文件提供反馈，人类在 VSCode 中直观查看
- 学习笔记：给阅读材料添加个人注释

## 已知限制

- **评论浮窗**：VSCode API 不支持自定义弹出式浮窗，当前使用 InputBox 输入批注内容。未来可通过 Webview 面板内嵌编辑器实现更接近 Obsidian 的体验
- **锚定漂移**：当源文本被大量修改时，`text-range` 锚定可能失效，会退回 `paragraph_index` 备用定位

## 文档

- [人类使用说明](docs/user-guide.md)
- [Agent 使用说明](docs/agent-guide.md)

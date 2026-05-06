# MD Annotate — Agent 使用说明

本文档面向 AI agent，说明如何通过直接操作 JSON 文件来读取和创建批注。

## 文件约定

对于一个 markdown 文件 `path/to/doc.md`，其 metadata 文件为：

```
path/to/doc.annotations.json       ← 人类批注
path/to/doc.ai-annotations.json    ← AI 批注
```

如果配置为 `.annotations` 目录模式：
```
path/to/.annotations/doc.annotations.json
path/to/.annotations/doc.ai-annotations.json
```

## JSON Schema

```json
{
  "version": "1.0",
  "source": "doc.md",
  "author_type": "ai",
  "annotations": [
    {
      "id": "ann_<unique>",
      "anchor": { ... },
      "content": "批注正文",
      "created_at": "ISO 8601 时间",
      "updated_at": "ISO 8601 时间",
      "resolved": false,
      "tags": ["suggestion", "question"],
      "thread": []
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `version` | string | ✓ | 固定为 `"1.0"` |
| `source` | string | ✓ | 被批注的 md 文件名（相对路径） |
| `author_type` | string | ✓ | `"human"` 或 `"ai"` |
| `annotations` | array | ✓ | 批注数组 |

### Annotation 对象

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 唯一 ID，格式 `ann_<随机字符>` |
| `anchor` | object | ✓ | 锚定信息，见下方 |
| `content` | string | ✓ | 批注正文（支持 markdown） |
| `created_at` | string | ✓ | ISO 8601 创建时间 |
| `updated_at` | string | | ISO 8601 更新时间 |
| `resolved` | boolean | | 是否已解决，默认 false |
| `tags` | string[] | | 标签列表 |
| `thread` | Reply[] | | 回复列表 |

### Anchor 类型

#### text-range（推荐）

```json
{
  "type": "text-range",
  "start_text": "被选中文本的起始片段（最多30字）",
  "end_text": "被选中文本的结束片段（最多30字）",
  "paragraph_index": 5
}
```

#### line-range

```json
{
  "type": "line-range",
  "start_line": 10,
  "end_line": 15
}
```

#### heading

```json
{
  "type": "heading",
  "heading_text": "Implementation Notes",
  "heading_level": 2
}
```

## jq 操作示例

### 读取所有未解决的批注

```bash
jq '.annotations[] | select(.resolved != true) | {id, content, anchor}' doc.annotations.json
```

### 添加一条新批注

```bash
jq --arg id "ann_$(date +%s)" \
   --arg content "这段逻辑可以简化" \
   --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '.annotations += [{
     id: $id,
     anchor: {type: "heading", heading_text: "Implementation", heading_level: 2},
     content: $content,
     created_at: $now,
     resolved: false,
     tags: ["suggestion"]
   }]' doc.ai-annotations.json > tmp.json && mv tmp.json doc.ai-annotations.json
```

### 标记批注为已解决

```bash
jq '(.annotations[] | select(.id == "ann_sample001")).resolved = true' doc.annotations.json > tmp.json && mv tmp.json doc.annotations.json
```

### 统计批注数量

```bash
jq '{total: (.annotations | length), resolved: ([.annotations[] | select(.resolved)] | length), open: ([.annotations[] | select(.resolved != true)] | length)}' doc.annotations.json
```

### 按 tag 筛选

```bash
jq '.annotations[] | select(.tags | index("important"))' doc.annotations.json
```

### 获取某个标题下的所有批注

```bash
jq '.annotations[] | select(.anchor.type == "heading" and .anchor.heading_text == "Goals")' doc.annotations.json
```

### 创建空的 AI 批注文件

```bash
echo '{"version":"1.0","source":"doc.md","author_type":"ai","annotations":[]}' | jq . > doc.ai-annotations.json
```

### 在批注上添加回复

```bash
jq --arg id "reply_$(date +%s)" \
   --arg content "同意，已修改" \
   --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
   '(.annotations[] | select(.id == "ann_sample001")).thread += [{
     id: $id,
     author_type: "human",
     content: $content,
     created_at: $now
   }]' doc.annotations.json > tmp.json && mv tmp.json doc.annotations.json
```

## Agent 工作流建议

1. **读取任务**：先用 `jq` 读取人类的 `.annotations.json`，了解人类标记的重点和问题
2. **响应**：在 `.ai-annotations.json` 中添加你的回应，锚定到相关位置
3. **标记完成**：完成任务后，可以将相关批注标记为 `resolved`
4. **使用 tags**：用标签区分批注类型（suggestion, question, done, blocker）

## 注意事项

- 不要修改人类的 `.annotations.json`（除非明确要求标记 resolved）
- AI 只写 `.ai-annotations.json`
- ID 必须唯一，建议用时间戳 + 随机字符
- `paragraph_index` 是零基索引（从 0 开始数行）
- 锚定文本片段应足够长以避免歧义，但不超过 30 字符

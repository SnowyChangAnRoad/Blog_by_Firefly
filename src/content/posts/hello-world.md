---
title: 你好，世界
published: 2026-08-22
description: 这是本博客的第一篇示例文章，演示 Markdown 各类元素。
slug: hello-world
draft: false
---

欢迎来到我的个人博客！本站由 **FastAPI** 驱动，文章用 Markdown 编写，对话页接入了 DeepSeek 大模型。

## 我能做什么

- 浏览文章列表与详情
- 在 `/chat` 页面与大模型进行多轮对话（流式打字机效果）
- 文章 URL 永久链接，便于分享

## 代码示例

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"hello": "world"}
```

## 引用一段话

> 任何足够先进的科技，都与魔法无异。
> —— 阿瑟·克拉克

## 表格示例

| 模块 | 技术 |
| --- | --- |
| 后端 | FastAPI + Uvicorn |
| 数据库 | SQLite |
| 大模型 | DeepSeek |

---

要发布新文章，只需在 `posts/` 目录新增 `.md` 文件即可，无需重新部署。

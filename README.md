# kaolaqi-skills

一个用来开发日常工作生活中常用的 skills 的个人项目。

## Skills

| Skill | 说明 |
|-------|------|
| [feishu-doc](./skills/feishu-doc) | 将对话内容导出为飞书文档，或读取飞书文档到对话 |

## 快速安装

```bash
# 克隆项目
git clone https://github.com/kaolaqi/kaolaqi-skills.git
cd kaolaqi-skills

# 安装所有 skills 到 Claude Code
bash scripts/install.sh
```

## 更新

```bash
git pull
bash scripts/update.sh
```

## 添加新 Skill

参考 [CLAUDE.md](./CLAUDE.md) 中的说明。

## Tech Stack

- TypeScript + Node.js >= 18
- MCP (Model Context Protocol) SDK
- ESM modules

# kaolaqi-skills

一个用来开发日常工作生活中常用的 skills 的个人项目。

## Skills

| Skill | 说明 |
|-------|------|
| [feishu-doc](./skills/feishu-doc) | 将对话内容导出为飞书文档，或读取飞书文档到对话 |
| [juejin-doc](./skills/juejin-doc) | 将 AI 生成的文章一键发布到掘金，支持草稿保存、文章更新、列表查看 |
| [deploy](./skills/deploy) | 基于 Chrome Devtools MCP 的一键部署工具，自动获取 Token 并部署到测试环境，零依赖无需 puppeteer |

## 快速安装

```bash
# 克隆项目
git clone https://github.com/kaolaqi/kaolaqi-skills.git
cd kaolaqi-skills

# 安装所有 skills 到 Claude Code
npm run install-skills

# 只安装指定 skill
npm run install-skills -- feishu-doc
```

安装脚本会自动完成：

1. 将 skill 文件同步到 `~/.claude/skills/<name>/`
2. 执行 `npm install` 安装依赖
3. 执行 `npm run build` 编译 TypeScript
4. 检测并提示 MCP 服务注册（如需环境变量，会打印注册命令）

## 更新

```bash
git pull
npm run install-skills
```

## 添加新 Skill

参考 [CLAUDE.md](./CLAUDE.md) 中的说明。

## Tech Stack

- TypeScript + Node.js >= 18
- MCP (Model Context Protocol) SDK
- ESM modules

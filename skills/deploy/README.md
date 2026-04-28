# Deploy — 基于 Chrome Devtools Mcp 的一键部署工具

通过 AI + Chrome Devtools Mcp 自动获取内部平台 Token，并一键部署项目到测试环境。无需安装 puppeteer，无需手动复制 token。

## 为什么用这个

原版 deploy skill 依赖 puppeteer，存在以下痛点：

- puppeteer 需要下载 200MB+ 的 Chrome 浏览器，安装慢且容易失败
- 每次获取 token 都要启动一个独立的浏览器实例
- 网络环境不好时 puppeteer 安装经常报错

此版本的 deploy 用 Chrome Devtools MCP 直接操控你本机已打开的 Chrome 浏览器，**零依赖、零安装、即开即用**。

## 前置要求

1. **Chrome 浏览器** — 本机已安装并运行
2. **Node.js** — 用于执行部署脚本和读取配置文件
3. **Chrome DevTools MCP** — 首次使用时 AI 会自动检测，未安装会引导你安装

## 快速开始

### 一句话部署

在你的项目目录下，对 AI 说：

```
部署到测试环境
```

或者指定环境和分支：

```
部署到 prod 环境，分支 feature/xxx
```

AI 会自动完成所有事情，你只需要在必要时扫码登录。

### 完整执行流程

AI 收到部署指令后，会按以下顺序自动执行：

```
┌─────────────────────────────────────────┐
│  阶段一：检查 Token                       │
│  ├─ 配置文件是否存在？                     │
│  └─ Token 是否有效？（调接口验证）          │
│      ├─ ✅ 有效 → 直接部署                │
│      └─ ❌ 无效/不存在 ↓                  │
├─────────────────────────────────────────┤
│  阶段二：通过Chrome Devtools MCP 获取 Token│
│  ├─ 检测 Chrome MCP 是否已安装            │
│  │   └─ 未安装 → 引导安装                 │
│  ├─ 打开内部平台登录页                   │
│  ├─ 等待你扫码登录                        │
│  ├─ 自动提取 token + 用户信息              │
│  └─ 写入 ~/.auto-deploy.json             │
├─────────────────────────────────────────┤
│  阶段三：执行部署                          │
│  ├─ 自动检测项目类型和配置                  │
│  ├─ 调用 内部 平台部署接口                  │
│  └─ 返回部署结果                          │
└─────────────────────────────────────────┘
```

## 安装 Chrome DevTools MCP

首次使用时，如果 AI 检测到 Chrome Devtools MCP 未安装，会提示你安装。

### Kiro 中安装

在 MCP 配置面板中添加 chrome-Devtools-mcp 服务。

### Claude Code 中安装

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

安装完成后告诉 AI 即可继续。

## 配置文件说明

### 全局配置 `~/.auto-deploy.json`

由 AI 通过 Chrome Devtools MCP 自动生成，也可手动创建：

```json
{
  "tokenCrm": "你的 token",
  "xToken": "你的 token",
  "xUserId": "你的 user id",
  "userName": "你的昵称"
}
```

### 项目配置 `.deploy.json`

首次部署时自动生成在项目根目录，也可手动创建：

```json
{
  "service": "项目服务名",
  "gitGroup": "git 分组名",
  "projectType": "fe"
}
```

| 字段 | 说明 | 自动检测方式 |
|------|------|-------------|
| service | 服务名称 | 前端读 `package.json` 的 name，Java 读 `pom.xml` 的 artifactId |
| gitGroup | Git 分组 | 从 `git remote origin` URL 中截取 |
| projectType | 项目类型 | 有 `package.json` 为 `fe`，有 `pom.xml` 为 `be` |

## 常见问题

### Token 过期了怎么办？

不需要手动处理。AI 在部署前会自动验证 token 有效性，过期了会自动触发 Chrome Devtools MCP 重新获取流程。

### Chrome Devtools MCP 连接不上怎么办？

确保：
1. Chrome 浏览器已打开
2. Chrome DevTools MCP Server 正在运行
3. 如果使用 Claude Code，确认 `claude mcp list` 中包含 chrome-devtools

### 只想获取 Token 不部署？

对 AI 说：

```
帮我获取部署 token
```

### 需要手动执行部署脚本？

```bash
bash ~/.claude/skills/mcp-deploy/scripts/deploy.sh dev         # 部署到 dev
bash ~/.claude/skills/mcp-deploy/scripts/deploy.sh prod        # 部署到 prod
bash ~/.claude/skills/mcp-deploy/scripts/deploy.sh dev feat/x  # 指定分支
```

## 文件结构

```
/skills/deploy/
├── README.md          # 本文档（用户使用指南）
├── SKILL.md           # AI skill 定义（AI 读取的指令文件）
└── scripts/
    └── deploy.sh      # 部署脚本
```

## 与原版 deploy 对比

| | 原版 deploy | 新版 deploy |
|---|---|---|
| 获取 token | puppeteer 启动独立 Chrome（200MB+） | Chrome Devtools MCP 操控已有浏览器（零安装） |
| 扫码登录 | 在 puppeteer 弹出的窗口中 | 在你正常使用的 Chrome 中 |
| token 过期 | deploy.sh 自动调 fetch-token.js | AI 自动检测并重新获取 |
| 依赖 | Node.js + puppeteer | 仅 Node.js + Chrome Devtools MCP |
| MCP 检测 | 无 | 自动检测，未安装则引导安装 |

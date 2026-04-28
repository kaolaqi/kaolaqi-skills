# Deploy 部署到测试环境 — /deploy [dev|prod] [branch]

在项目目录下执行，自动调用内部部署平台创建部署任务。

- dev（默认）：isSecurityCheck=true
- prod：isSecurityCheck=false
- branch（可选）：指定部署分支，不传则使用当前分支

## 执行流程

收到用户的部署指令后，**严格按以下顺序执行**：

---

### 阶段一：检查 Token 配置及有效性

#### 1.1 检查配置文件是否存在

检查 `~/.auto-deploy.json` 文件是否存在，读取其内容。

如果文件不存在或内容为空 → 跳转到 **阶段二**。

#### 1.2 验证 Token 有效性

使用配置文件中的 token 调用接口验证是否过期：

```bash
curl -s "https://one.corp.hetao101.com/api/user/getUserInfo" \
  -H "accept: application/json, text/plain, */*" \
  -H "x-token: <xToken>"
```

判断逻辑：
- 返回 `code === 0` → Token 有效，跳转到 **阶段三**
- 返回其他 code 或请求失败 → Token 已过期，跳转到 **阶段二**

---

### 阶段二：通过 Chrome DevTools MCP 获取 Token

#### 2.1 检查 Chrome DevTools MCP 是否可用

尝试调用 Chrome DevTools MCP 的任意工具（如 `list_pages`）来检测 MCP 是否已安装并可用。

如果调用失败（MCP 未安装）：

1. 提示用户需要安装 Chrome DevTools MCP
2. 告知用户安装方式：
   - **Kiro**：在 MCP 配置面板中添加 chrome-devtools-mcp，或在 `.kiro/settings/mcp.json` 中添加配置
   - **Claude Code**：执行 `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`
3. 等待用户确认安装完成后，重新检测

如果调用成功 → 继续下一步。

#### 2.2 打开 内部 平台登录页

使用 Chrome Devtools MCP 的 `navigate_page` 工具，打开：

```
https://one.corp.hetao101.com
```

#### 2.3 等待用户扫码登录

告知用户：**"请在浏览器中扫码登录 one 平台，登录完成后告诉我"**。

等待用户确认已登录。

#### 2.4 从 localStorage 提取 Token

使用 Chrome Devtools MCP 的 `evaluate_script` 工具执行：

```javascript
() => {
  return localStorage.getItem("token");
}
```

如果返回 null 或空值，提示用户可能未登录成功，请重试。

#### 2.5 调用 getUserInfo 接口获取用户信息

使用 Chrome Devtools MCP 的 `evaluate_script` 工具，通过 `args` 传入上一步获取的 token：

```javascript
async (token) => {
  const res = await fetch("https://one.corp.hetao101.com/api/user/getUserInfo", {
    headers: {
      "accept": "application/json, text/plain, */*",
      "x-token": token
    }
  });
  return res.json();
}
```

#### 2.6 写入配置文件

将获取到的信息组装为 JSON，写入 `~/.auto-deploy.json`：

```json
{
  "tokenCrm": "<token>",
  "xToken": "<token>",
  "xUserId": "<String(userInfo.data.userInfo.ID)>",
  "userName": "<userInfo.data.userInfo.userName 去掉 @hetao101.com 后缀>"
}
```

如果已有配置文件，合并写入（保留其他字段）。

写入成功后告知用户：`✅ Token 已更新，用户: xxx (id=xxx)`

---

### 阶段三：执行部署

执行部署脚本：

```bash
bash ~/.claude/skills/deploy/scripts/deploy.sh <dev|prod> [branch]
```

参数说明：
- 第一个参数：`dev`（默认）或 `prod`
- 第二个参数：分支名（可选，不传则使用当前 git 分支）

根据脚本输出告知用户部署结果。

---

## 项目配置文件 `.deploy.json`

首次部署时由脚本自动生成在项目根目录，也可手动创建：

```json
{
  "service": "项目服务名",
  "gitGroup": "git 分组名",
  "projectType": "fe"
}
```

- `service`：前端读 `package.json` 的 name，Java 读 `pom.xml` 的 artifactId
- `gitGroup`：从 git remote origin URL 中截取
- `projectType`：前端为 `fe`，后端为 `be`

## 注意事项

- 必须在前端（含 package.json）或 Java（含 pom.xml）项目目录下执行
- 此 skill 不依赖 puppeteer，通过 Chrome MCP 操控浏览器获取 Token
- Token 过期后会自动触发重新获取流程，无需用户手动干预
- 项目配置文件 `.deploy.json` 建议加入 `.gitignore`

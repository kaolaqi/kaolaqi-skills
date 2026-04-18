#!/usr/bin/env node

// 将 skills/ 目录下的 TypeScript MCP skills 安装到 ~/.claude/skills/
// 用法：
//   node install-skills.js              # 安装全部 skills
//   node install-skills.js feishu-doc   # 只安装指定 skill

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SKILLS_DIR = path.join(__dirname, 'skills');
const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.claude', 'skills');

// 不复制的目录/文件
const EXCLUDE = new Set(['node_modules', 'dist', '.git']);

const skillName = process.argv[2];

// --- 工具函数 ---

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function tryRun(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function log(msg)  { process.stdout.write(`\x1b[32m[install]\x1b[0m ${msg}\n`); }
function warn(msg) { process.stdout.write(`\x1b[33m[warn]\x1b[0m ${msg}\n`); }
function err(msg)  { process.stderr.write(`\x1b[31m[error]\x1b[0m ${msg}\n`); }

// --- 安装单个 skill ---

function installSkill(name) {
  const srcDir = path.join(SKILLS_DIR, name);
  const dstDir = path.join(INSTALL_DIR, name);

  if (!fs.existsSync(srcDir)) {
    err(`找不到 skill: ${name}`);
    process.exit(1);
  }

  log(`安装 skill: ${name}`);

  // 1. 复制源文件（排除 node_modules / dist）
  log(`  复制文件 → ${dstDir}`);
  copyDirSync(srcDir, dstDir);

  // 2. npm install + build
  log('  npm install...');
  run('npm install --silent', dstDir);

  log('  npm run build...');
  run('npm run build', dstDir);

  log(`  构建完成: ${dstDir}/dist/index.js`);

  // 3. 读取 install.json 处理 MCP 注册
  const installConfigPath = path.join(srcDir, 'install.json');
  if (fs.existsSync(installConfigPath)) {
    const config = JSON.parse(fs.readFileSync(installConfigPath, 'utf-8'));
    if (config.mcp) {
      handleMcpRegistration(config.mcp, dstDir);
    }
  }

  log(`  skill '${name}' 安装完成。\n`);
}

// --- MCP 注册 ---

function handleMcpRegistration(mcp, dstDir) {
  const mcpName = mcp.name;
  const entrypoint = path.join(dstDir, mcp.entrypoint);
  const scope = mcp.scope || 'user';
  const envDefs = mcp.env || [];

  // 检查是否已经注册
  const alreadyRegistered = isMcpRegistered(mcpName);
  if (alreadyRegistered) {
    log(`  MCP '${mcpName}' 已注册，跳过。`);
    return;
  }

  // 收集 env 变量
  const envArgs = [];
  const missing = [];

  for (const { key, description } of envDefs) {
    const val = process.env[key];
    if (val) {
      envArgs.push(`-e ${key}=${val}`);
    } else {
      missing.push({ key, description });
    }
  }

  if (missing.length === 0) {
    // 所有 env 都有，自动注册
    const cmd = buildMcpAddCmd(mcpName, scope, envArgs, entrypoint);
    log(`  注册 MCP '${mcpName}'...`);
    const ok = tryRun(cmd);
    if (ok) {
      log(`  MCP '${mcpName}' 注册成功。重启 Claude Code 后生效。`);
    } else {
      warn(`  自动注册失败，请手动执行：`);
      printMcpCmd(mcpName, scope, envDefs, entrypoint);
    }
  } else {
    // 缺少 env 变量，打印注册命令
    warn(`  MCP '${mcpName}' 需要以下环境变量，请手动注册：`);
    for (const { key, description } of missing) {
      warn(`    ${key}: ${description}`);
    }
    console.log('');
    printMcpCmd(mcpName, scope, envDefs, entrypoint);
  }
}

function isMcpRegistered(name) {
  try {
    const output = execSync('claude mcp list', { stdio: 'pipe' }).toString();
    return output.includes(name);
  } catch {
    return false;
  }
}

function buildMcpAddCmd(name, scope, envArgs, entrypoint) {
  return `claude mcp add ${envArgs.join(' ')} -s ${scope} ${name} -- node ${entrypoint}`;
}

function printMcpCmd(name, scope, envDefs, entrypoint) {
  const envParts = envDefs.map(({ key }) => `-e ${key}=<${key}>`);
  console.log('  ' + [
    'claude mcp add',
    ...envParts,
    `-s ${scope}`,
    name,
    '--',
    `node ${entrypoint}`,
  ].join(' \\\n    '));
  console.log('');
  console.log('  设置完成后重启 Claude Code。');
  console.log('');
}

// --- 主流程 ---

if (!fs.existsSync(SKILLS_DIR)) {
  err(`找不到 skills 目录: ${SKILLS_DIR}`);
  process.exit(1);
}

fs.mkdirSync(INSTALL_DIR, { recursive: true });

if (skillName) {
  installSkill(skillName);
} else {
  const skills = fs.readdirSync(SKILLS_DIR)
    .filter(d => fs.statSync(path.join(SKILLS_DIR, d)).isDirectory());

  if (skills.length === 0) {
    warn('没有找到任何 skill。');
    process.exit(0);
  }

  for (const name of skills) {
    installSkill(name);
  }
}

log('全部完成。');

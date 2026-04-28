#!/bin/bash

# 部署到测试环境（MCP 版本）
# 使用方法：bash deploy.sh [dev|prod] [branch]
# Token 获取由 AI 通过 Chrome MCP 完成，不再依赖 puppeteer

ENV="${1:-dev}"
BRANCH_ARG="${2:-}"

if [ "$ENV" = "dev" ]; then
  IS_SECURITY_CHECK=true
elif [ "$ENV" = "prod" ]; then
  IS_SECURITY_CHECK=false
else
  echo "❌ 无效参数: $ENV，只支持 dev 或 prod"
  exit 1
fi

GLOBAL_CONFIG_FILE="$HOME/.auto-deploy.json"
PROJECT_CONFIG_FILE=".deploy.json"

# 检查全局配置文件
if [ ! -f "$GLOBAL_CONFIG_FILE" ]; then
  echo "❌ 配置文件 $GLOBAL_CONFIG_FILE 不存在"
  echo "请让 AI 通过 Chrome MCP 执行「获取部署 Token」流程"
  exit 1
fi

# 自动检测项目类型：fe（前端）或 be（后端）
_detect_project_type() {
  if [ -f "package.json" ]; then
    echo "fe"
  elif [ -f "pom.xml" ]; then
    echo "be"
  else
    echo ""
  fi
}

# 自动检测 service 名称
_detect_service() {
  if [ -f "package.json" ]; then
    node -e "console.log(require('./package.json').name)" 2>/dev/null
  elif [ -f "pom.xml" ]; then
    sed '/<parent>/,/<\/parent>/d' pom.xml | grep -m1 '<artifactId>' | sed 's|.*<artifactId>\([^<]*\)</artifactId>.*|\1|' | tr -d '[:space:]'
  else
    echo ""
  fi
}

# 自动检测 gitGroup
_detect_git_group() {
  local url
  url=$(git remote get-url origin 2>/dev/null)
  if [ -z "$url" ]; then
    echo ""
    return
  fi
  local path_part
  path_part=$(echo "$url" | sed 's|.*[:/]\([^/]*/[^/]*\)$|\1|')
  echo "$path_part" | cut -d'/' -f1
}

# 生成项目配置文件
_generate_project_config() {
  local service
  local git_group
  local project_type
  service=$(_detect_service)
  git_group=$(_detect_git_group)
  project_type=$(_detect_project_type)

  if [ -z "$service" ]; then
    echo "❌ 无法自动检测 service 名称，请手动创建 $PROJECT_CONFIG_FILE"
    echo '{'
    echo '  "service": "your-service-name",'
    echo '  "gitGroup": "your-git-group",'
    echo '  "projectType": "fe"'
    echo '}'
    exit 1
  fi

  if [ -z "$git_group" ]; then
    echo "❌ 无法从 git remote 自动检测 gitGroup，请手动创建 $PROJECT_CONFIG_FILE"
    echo '{'
    echo "  \"service\": \"$service\","
    echo '  "gitGroup": "your-git-group",'
    echo "  \"projectType\": \"$project_type\""
    echo '}'
    exit 1
  fi

  cat > "$PROJECT_CONFIG_FILE" <<EOF
{
  "service": "$service",
  "gitGroup": "$git_group",
  "projectType": "$project_type"
}
EOF
  echo "✅ 已自动生成项目配置文件 $PROJECT_CONFIG_FILE (service=$service, gitGroup=$git_group, projectType=$project_type)"
}

# 检查项目配置文件，不存在则自动生成
if [ ! -f "$PROJECT_CONFIG_FILE" ]; then
  echo "⚙️  未找到项目配置文件 $PROJECT_CONFIG_FILE，正在自动生成..."
  _generate_project_config
fi

# 读取全局配置
TOKEN_CRM=$(node -e "console.log(require('$GLOBAL_CONFIG_FILE').tokenCrm)")
X_TOKEN=$(node -e "console.log(require('$GLOBAL_CONFIG_FILE').xToken)")
X_USER_ID=$(node -e "console.log(require('$GLOBAL_CONFIG_FILE').xUserId)")
USER_NAME=$(node -e "console.log(require('$GLOBAL_CONFIG_FILE').userName)")

# 读取项目配置
SERVICE=$(node -e "console.log(require('./$PROJECT_CONFIG_FILE').service)")
GIT_GROUP=$(node -e "console.log(require('./$PROJECT_CONFIG_FILE').gitGroup)")
PROJECT_TYPE=$(node -e "console.log(require('./$PROJECT_CONFIG_FILE').projectType)")

if [ -n "$BRANCH_ARG" ]; then
  BRANCH="$BRANCH_ARG"
else
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi
TIMESTAMP=$(date +%y%m%d%H%M%S)
DEPLOY_INSTANCE="${SERVICE}.main.testing"

echo "🚀 开始部署..."
echo "  服务: $SERVICE"
echo "  分支: $BRANCH"
echo "  实例: $DEPLOY_INSTANCE"

# 发送部署请求
RESPONSE=$(curl -s "https://one.corp.hetao101.com/api/deploy/${PROJECT_TYPE}/testing/create" \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json' \
  -b "tokenCrm=${TOKEN_CRM}; x-token=${X_TOKEN}" \
  -H "x-token: ${X_TOKEN}" \
  -H "x-user-id: ${X_USER_ID}" \
  --data-raw "{\"ciEvent\":\"build\",\"timeStamp\":${TIMESTAMP},\"service\":\"${SERVICE}\",\"Branch\":\"${BRANCH}\",\"businessLine\":\"main\",\"gitGroup\":\"${GIT_GROUP}\",\"k8sNamespace\":\"testing\",\"k8sClusterName\":\"tx-test\",\"deployInstanceInfo\":\"${DEPLOY_INSTANCE}\",\"isEmergencyCi\":false,\"isSecurityCheck\":${IS_SECURITY_CHECK},\"userName\":\"${USER_NAME}\"}")

# 检查返回结果
RESP_CODE=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).code)}catch{console.log('')}})")

if [ "$RESP_CODE" != "0" ] && [ -n "$RESP_CODE" ]; then
  echo ""
  echo "⚠️  部署请求失败 (code=$RESP_CODE)，Token 可能已过期"
  echo "请让 AI 通过 Chrome MCP 重新执行「获取部署 Token」流程，然后再次部署"
  echo ""
  echo "📋 返回结果:"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "📋 返回结果:"
echo "$RESPONSE"

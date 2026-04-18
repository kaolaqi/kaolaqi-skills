#!/usr/bin/env bash
# Install all kaolaqi-skills into Claude Code
# Usage: bash scripts/install.sh [skill-name]
#   skill-name: optional, install only the named skill (e.g. feishu-doc)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${REPO_DIR}/skills"
INSTALL_DIR="${HOME}/.claude/skills"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[install]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
log_error() { echo -e "${RED}[error]${NC} $*" >&2; }

install_skill() {
  local skill_name="$1"
  local src_dir="${SKILLS_DIR}/${skill_name}"
  local dest_dir="${INSTALL_DIR}/${skill_name}"

  if [[ ! -d "${src_dir}" ]]; then
    log_error "Skill '${skill_name}' not found at ${src_dir}"
    return 1
  fi

  log_info "Installing skill: ${skill_name}"

  # Copy skill files to install dir (exclude node_modules and dist)
  mkdir -p "${dest_dir}"
  rsync -a --delete \
    --exclude='node_modules/' \
    --exclude='dist/' \
    "${src_dir}/" "${dest_dir}/"

  # Build TypeScript
  log_info "  Building TypeScript..."
  (cd "${dest_dir}" && npm install --silent && npm run build --silent)

  log_info "  Build complete: ${dest_dir}/dist/index.js"

  # Register MCP server based on skill name
  register_mcp "${skill_name}" "${dest_dir}"

  log_info "  Skill '${skill_name}' installed successfully."
  echo ""
}

register_mcp() {
  local skill_name="$1"
  local dest_dir="$2"

  case "${skill_name}" in
    feishu-doc)
      log_info "  Registering MCP server: feishu-doc"
      log_warn "  FEISHU_APP_ID and FEISHU_APP_SECRET must be set."
      echo ""
      echo "  Run the following command to register (replace with your credentials):"
      echo ""
      echo "  claude mcp add \\"
      echo "    -e FEISHU_APP_ID=cli_xxxxx \\"
      echo "    -e FEISHU_APP_SECRET=xxxxx \\"
      echo "    -s user feishu-doc \\"
      echo "    -- node ${dest_dir}/dist/index.js"
      echo ""
      echo "  Then restart Claude Code."
      ;;
    *)
      log_warn "  No MCP registration defined for '${skill_name}'. Add it to scripts/install.sh."
      ;;
  esac
}

main() {
  local filter="${1:-}"

  if [[ ! -d "${SKILLS_DIR}" ]]; then
    log_error "Skills directory not found: ${SKILLS_DIR}"
    exit 1
  fi

  mkdir -p "${INSTALL_DIR}"

  if [[ -n "${filter}" ]]; then
    install_skill "${filter}"
  else
    for skill_dir in "${SKILLS_DIR}"/*/; do
      if [[ -d "${skill_dir}" ]]; then
        skill_name="$(basename "${skill_dir}")"
        install_skill "${skill_name}"
      fi
    done
  fi

  log_info "All done. Restart Claude Code to activate new skills."
}

main "$@"

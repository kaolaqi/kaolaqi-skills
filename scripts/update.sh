#!/usr/bin/env bash
# Update all installed kaolaqi-skills (pull latest source + rebuild)
# Usage: bash scripts/update.sh [skill-name]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${REPO_DIR}/skills"
INSTALL_DIR="${HOME}/.claude/skills"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[update]${NC} $*"; }
log_error() { echo -e "${RED}[error]${NC} $*" >&2; }

update_skill() {
  local skill_name="$1"
  local src_dir="${SKILLS_DIR}/${skill_name}"
  local dest_dir="${INSTALL_DIR}/${skill_name}"

  if [[ ! -d "${src_dir}" ]]; then
    log_error "Skill '${skill_name}' not found at ${src_dir}"
    return 1
  fi

  if [[ ! -d "${dest_dir}" ]]; then
    log_error "Skill '${skill_name}' is not installed. Run scripts/install.sh first."
    return 1
  fi

  log_info "Updating skill: ${skill_name}"

  # Sync source (exclude node_modules and dist)
  rsync -a --delete \
    --exclude='node_modules/' \
    --exclude='dist/' \
    "${src_dir}/" "${dest_dir}/"

  # Rebuild
  log_info "  Rebuilding TypeScript..."
  (cd "${dest_dir}" && npm install --silent && npm run build --silent)

  log_info "  Skill '${skill_name}' updated."
  echo ""
}

main() {
  local filter="${1:-}"

  if [[ -n "${filter}" ]]; then
    update_skill "${filter}"
  else
    for skill_dir in "${SKILLS_DIR}"/*/; do
      if [[ -d "${skill_dir}" ]]; then
        update_skill "$(basename "${skill_dir}")"
      fi
    done
  fi

  log_info "Update complete. Restart Claude Code to pick up changes."
}

main "$@"

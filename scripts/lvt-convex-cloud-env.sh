#!/bin/zsh
# Run a Convex CLI command against LVT-CRM on Convex Cloud.
#   dev  -> dev:decisive-puma-318 (sandbox)
#   prod -> prod:confident-guanaco-953 (customers; needs LVT_CONVEX_CONFIRM_PROD and a clean tree)
# The deploy key comes from the untracked keys CSV (row LVT-CRM) and is passed only via the
# environment. Self-hosted variables are blanked so nothing can reach 127.0.0.1:3318, which now
# belongs to another project.
set -euo pipefail

usage() {
  echo "usage: $0 <dev|prod> <command> [args...]" >&2
  exit 64
}

(( $# >= 2 )) || usage
readonly TARGET="$1"
shift

case "$TARGET" in
  dev) readonly EXPECTED="dev:decisive-puma-318" COLUMN=3 ;;
  prod) readonly EXPECTED="prod:confident-guanaco-953" COLUMN=2 ;;
  *) usage ;;
esac

readonly REPO="${0:A:h:h}"
readonly KEYS_FILE="${LVT_CONVEX_KEYS_FILE:-$HOME/projects/LVT-CRM/.convex-cloud-keys.csv}"

if [[ "$TARGET" == prod ]]; then
  if [[ "${LVT_CONVEX_CONFIRM_PROD:-}" != "${EXPECTED#prod:}" ]]; then
    echo "refusing prod: set LVT_CONVEX_CONFIRM_PROD=${EXPECTED#prod:} to deploy to customers" >&2
    exit 77
  fi
  if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    echo "refusing prod: tracked files have uncommitted changes; use a clean worktree of the reviewed commit" >&2
    exit 77
  fi
fi

if [[ ! -r "$KEYS_FILE" ]]; then
  echo "Convex keys file not readable: $KEYS_FILE" >&2
  exit 78
fi
key="$(awk -F, -v column="$COLUMN" '$1 == "LVT-CRM" { print $column; exit }' "$KEYS_FILE" | tr -d '\r')"
if [[ "$key" != "$EXPECTED|"?* ]]; then
  echo "LVT-CRM $TARGET key in $KEYS_FILE is missing or not for $EXPECTED" >&2
  exit 78
fi

export CONVEX_DEPLOY_KEY="$key"
export CONVEX_DEPLOYMENT=""
export CONVEX_SELF_HOSTED_URL=""
export CONVEX_SELF_HOSTED_ADMIN_KEY=""
unset key

exec "$@"

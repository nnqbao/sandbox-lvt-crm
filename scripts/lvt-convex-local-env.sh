#!/bin/zsh
# Run a Convex CLI command against THIS checkout's self-hosted backend.
#   sandbox -> only from a checkout whose infra/convex-local/.env says LVT_CONVEX_ROLE=sandbox
#   prod    -> only from a checkout with LVT_CONVEX_ROLE=prod, LVT_CONVEX_CONFIRM_PROD=local-prod
#              and a clean tree (customers)
# Port and admin-key Keychain item come from the untracked infra/convex-local/.env; the admin key
# is read from the Keychain and passed only through the environment. Cloud variables are blanked
# so the CLI cannot reach a Convex Cloud deployment by accident.
set -euo pipefail

usage() {
  echo "usage: $0 <sandbox|prod> <command> [args...]" >&2
  exit 64
}

(( $# >= 2 )) || usage
readonly TARGET="$1"
shift
[[ "$TARGET" == sandbox || "$TARGET" == prod ]] || usage

readonly REPO="${0:A:h:h}"
readonly ENV_FILE="$REPO/infra/convex-local/.env"
value() { sed -n "s/^$1=\\(.*\\)\$/\\1/p" "$ENV_FILE" 2>/dev/null | tail -n 1; }

if [[ ! -r "$ENV_FILE" ]]; then
  echo "no $ENV_FILE (copy infra/convex-local/.env.example)" >&2
  exit 78
fi
readonly ROLE="$(value LVT_CONVEX_ROLE)"
readonly PORT="$(value LVT_CONVEX_BACKEND_PORT)"
readonly KEY_ITEM="$(value LVT_CONVEX_ADMIN_KEY_ITEM)"

if [[ "$ROLE" != "$TARGET" ]]; then
  echo "refusing: this checkout is LVT_CONVEX_ROLE=${ROLE:-unset}, not $TARGET" >&2
  exit 77
fi
if [[ ! "$PORT" =~ ^[0-9]+$ || -z "$KEY_ITEM" ]]; then
  echo "LVT_CONVEX_BACKEND_PORT / LVT_CONVEX_ADMIN_KEY_ITEM missing in $ENV_FILE" >&2
  exit 78
fi
if [[ "$TARGET" == prod ]]; then
  if [[ "${LVT_CONVEX_CONFIRM_PROD:-}" != local-prod ]]; then
    echo "refusing prod: set LVT_CONVEX_CONFIRM_PROD=local-prod to change the customers' backend" >&2
    exit 77
  fi
  if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    echo "refusing prod: tracked files have uncommitted changes; use a clean worktree of the reviewed commit" >&2
    exit 77
  fi
fi

if ! admin_key="$(security find-generic-password -s "$KEY_ITEM" -a lvt-crm -w 2>/dev/null)" || [[ -z "$admin_key" ]]; then
  echo "admin key $KEY_ITEM not found in the Keychain" >&2
  exit 78
fi

export CONVEX_SELF_HOSTED_URL="http://127.0.0.1:${PORT}"
export CONVEX_SELF_HOSTED_ADMIN_KEY="$admin_key"
export CONVEX_DEPLOYMENT=""
export CONVEX_DEPLOY_KEY=""
unset admin_key

exec "$@"

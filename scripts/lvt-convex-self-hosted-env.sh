#!/bin/zsh
# Retired at the Convex Cloud cutover (2026-09-14). 127.0.0.1:3210 now serves another project,
# so this wrapper refuses to run instead of pointing the Convex CLI there.
echo "lvt-convex-self-hosted-env.sh is retired: use ./scripts/lvt-convex-cloud-env.sh <dev|prod> <command>" >&2
exit 78

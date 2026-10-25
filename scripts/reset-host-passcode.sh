#!/usr/bin/env bash
# Reset only the host passcode; Firebase does not store this credential.
# Usage: bash scripts/reset-host-passcode.sh
set -euo pipefail
set +x
umask 077
cd "$(dirname "$0")/.."
command -v openssl >/dev/null
command -v vercel >/dev/null

ENV_FILE='.env.local'
PASSCODE="$(openssl rand -hex 12)"
TMP_FILE="$(mktemp .env.local.XXXXXX)"
trap 'rm -f "$TMP_FILE"' EXIT
if [[ -f "$ENV_FILE" ]]; then
  cp -p "$ENV_FILE" "${ENV_FILE}.$(date +%Y%m%d%H%M%S).bak"
  chmod 600 "${ENV_FILE}."*.bak
  awk '!/^[[:space:]]*(export[[:space:]]+)?HOST_PASSCODE[[:space:]]*=/' "$ENV_FILE" > "$TMP_FILE"
fi
printf '\nHOST_PASSCODE=%s\n' "$PASSCODE" >> "$TMP_FILE"
chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"

printf '%s' "$PASSCODE" | vercel env update HOST_PASSCODE production \
  --project tilt2vote --scope thibblab --sensitive --yes
unset PASSCODE
printf '\nPasscode saved in .env.local and updated in Vercel. Redeploying production…\n'
vercel redeploy https://tilt2vote.vercel.app --target production --scope thibblab
printf '\nDone. Read HOST_PASSCODE in .env.local to sign in again.\n'

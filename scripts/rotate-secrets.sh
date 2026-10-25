#!/usr/bin/env bash
# Compatibility entry point. Host authentication now uses Vercel, not Supabase.
set -euo pipefail
exec bash "$(dirname "$0")/reset-host-passcode.sh" "$@"

#!/bin/sh
set -eu

source_file=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/src/pi-notify-mac.ts
target_dir=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
target="$target_dir/extensions/pi-notify-mac.ts"

mkdir -p "$target_dir/extensions"
cp "$source_file" "$target"
printf 'Installed %s\n' "$target"
printf '%s\n' 'Restart Pi, or run /reload in an existing session.'

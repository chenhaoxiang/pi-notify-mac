#!/bin/sh
set -eu

# The entry point now imports sibling modules: single-file copying is unsupported.
# Use this only from a checksum-verified package/source you trust.
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$package_dir/scripts/install-local.mjs"

#!/bin/bash
# Reviewable service template helper; does not install or restart anything.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cat "$script_dir/deploy/farm-bridge.service"
printf '\nReview User, Group, paths, and EnvironmentFile before manual installation. See README.md.\n'

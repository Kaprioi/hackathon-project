#!/bin/sh
# Runs the stand's real inner-loop PID (copied out of sightline.ino) on this computer
# and checks how it moves. Needs a C++ compiler (c++). Usage: sh run.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
ino="$here/../sightline/sightline.ino"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
{
  echo '#include <cmath>'
  echo '#include <cstdint>'
  grep -E '^const (float|int|uint32_t) ' "$ino"  # the settings (numbers) only
  sed -n '/innerPid begin/,/innerPid end/p' "$ino"
} > "$tmp/firmware.h"
c++ -std=c++17 -O1 -I"$tmp" "$here/sim.cpp" -o "$tmp/sim"
"$tmp/sim"

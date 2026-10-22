#!/bin/sh
set -eu
mkdir -p desktop/linux-ble-scanner/publish
cc -O2 -Wall -Wextra desktop/linux-ble-scanner/scanner.c \
  -o desktop/linux-ble-scanner/publish/CuberBleScanner \
  $(pkg-config --cflags --libs gio-2.0 gio-unix-2.0)
test -x desktop/linux-ble-scanner/publish/CuberBleScanner

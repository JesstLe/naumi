#!/bin/sh
set -eu
target=/opt/naumi-media-runtime
mkdir -p "$target/usr/bin" "$target/work" "$target/inputs"
cp -L /usr/bin/ffmpeg /usr/bin/ffprobe "$target/usr/bin/"
# Preserve loader paths; dereference links so per-job hardlinks cannot escape.
ldd /usr/bin/ffmpeg /usr/bin/ffprobe | awk '{ for(i=1;i<=NF;i++) if($i ~ /^\//) print $i }' | sort -u | while IFS= read -r file; do
  mkdir -p "$target$(dirname "$file")"
  cp -L "$file" "$target$file"
done
if [ -d /usr/share/fonts ]; then mkdir -p "$target/usr/share"; cp -rL /usr/share/fonts "$target/usr/share/"; fi
if [ -d /etc/fonts ]; then mkdir -p "$target/etc"; cp -rL /etc/fonts "$target/etc/"; fi
find "$target" -type d -exec chmod 755 {} +
find "$target" -type f -exec chmod 444 {} +
chmod 555 "$target/usr/bin/ffmpeg" "$target/usr/bin/ffprobe"
# execve also requires execute permission on the ELF interpreter. Shared
# libraries remain read-only; the loader and allowed binaries are executable.
find "$target" -type f \( -name 'ld-linux*.so*' -o -name 'ld-musl*.so*' \) -exec chmod 555 {} +

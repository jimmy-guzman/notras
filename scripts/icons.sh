#!/usr/bin/env bash
set -euo pipefail

apple_art=824
apple_canvas=1024
tray_size=36

hero_width=1280
hero_height=360
hero_icon=200
hero_gap=56
hero_radius=28
hero_sans=/System/Library/Fonts/SFNS.ttf

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

for tool in magick iconutil; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "icons: '$tool' not found"
    [ "$tool" = magick ] && echo "icons: install it with 'brew install imagemagick'"
    [ "$tool" = iconutil ] && echo "icons: iconutil ships with macOS, so this script only runs there"
    exit 1
  fi
done

out=src-tauri/icons
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

rasterize() {
  local svg=$1 sizes=$2 dir=$work/$3
  mkdir -p "$dir"
  pnpm exec tauri icon "$svg" -o "$dir" -p "$sizes" >/dev/null
}

palette() {
  awk -v scheme="$1" -v token="--$2:" '
    /@media \(prefers-color-scheme: light\)/ { light = 1 }
    $1 == token && light == (scheme == "light") {
      value = $2
      sub(/;$/, "", value)
      if (value !~ /^#[[:xdigit:]]+$/ || length(value) != 7) exit 1
      print value
      found++
    }
    END {
      if (found != 1) {
        print "icons: missing or invalid " scheme " " token > "/dev/stderr"
        exit 1
      }
    }
  ' src/styles.css
}

write_mark() {
  local scheme=$1 logical=$2 target=$3 foreground background ink tile_end
  local viewbox="0 0 136 136" tile=none sheet='url(#sheet)' seam=2 stroke=6 rim=3
  if [ "$scheme" = tray ]; then
    foreground="#ffffff" background="#000000" ink="#000000" tile_end="#000000"
    sheet="#ffffff" viewbox="-6 -6 148 148" seam=15 stroke=9
  else
    foreground=$(palette "$scheme" foreground)
    background=$(palette "$scheme" background)
    if [ "$scheme" = dark ]; then
      ink="#716b66" tile_end="#211b23"
    else
      ink="#faf7f2" tile_end="#eee7ed"
    fi
    if [ "$logical" -gt 0 ]; then
      viewbox="-36 -36 208 208" tile=inline
      # Optical weights follow logical size, including Retina representations.
      if [ "$logical" -le 24 ]; then seam=4.5 stroke=11 rim=6
      elif [ "$logical" -le 48 ]; then seam=4 stroke=10 rim=4
      else seam=3 stroke=8
      fi
    fi
  fi
  sed -e "s/var(--foreground)/$foreground/g" \
    -e "s/var(--background)/$background/g" \
    -e "s/var(--ink)/$ink/g" \
    -e "s/var(--tile-end)/$tile_end/g" \
    -e "s/var(--viewbox)/$viewbox/g" \
    -e "s/var(--tile)/$tile/g" \
    -e "s|url(#sheet)|$sheet|g" \
    -e "s/var(--seam)/$seam/g" \
    -e "s/var(--stroke)/$stroke/g" \
    -e "s/var(--rim)/$rim/g" assets/icon.svg > "$target"
  if grep -Fq 'var(' "$target"; then
    echo "icons: unresolved token in $target" >&2
    exit 1
  fi
}

write_hero() {
  local word=$work/hero-word.png tag=$work/hero-tag.png icon=$work/hero-icon.png
  local ww wh tw th group gx iy block by tx
  local hero_background hero_foreground hero_muted
  hero_background=$(palette dark background)
  hero_foreground=$(palette dark foreground)
  hero_muted=$(palette dark muted-foreground)
  if [ ! -f "$hero_sans" ]; then
    echo "icons: '$hero_sans' not found, so the hero cannot be drawn"
    exit 1
  fi
  magick -background none -fill "$hero_foreground" -font "$hero_sans" \
    -pointsize 86 -kerning -5 label:notras PNG32:"$word"
  magick -background none -fill "$hero_muted" -font "$hero_sans" \
    -pointsize 36 label:'write another note' PNG32:"$tag"
  ww=$(magick identify -format '%w' "$word")
  wh=$(magick identify -format '%h' "$word")
  tw=$(magick identify -format '%w' "$tag")
  th=$(magick identify -format '%h' "$tag")
  group=$((hero_icon + hero_gap + (ww > tw ? ww : tw)))
  gx=$(((hero_width - group) / 2))
  iy=$(((hero_height - hero_icon) / 2))
  block=$((wh + 10 + th))
  by=$(((hero_height - block) / 2))
  tx=$((gx + hero_icon + hero_gap))
  rasterize public/logo-dark.svg "$hero_icon" hero
  cp "$work/hero/${hero_icon}x${hero_icon}.png" "$icon"
  magick -size ${hero_width}x${hero_height} xc:none -fill "$hero_background" \
    -draw "roundrectangle 0,0 $((hero_width - 1)),$((hero_height - 1)) $hero_radius,$hero_radius" \
    PNG32:"$icon" -geometry +${gx}+${iy} -compose Over -composite \
    PNG32:"$word" -geometry +${tx}+${by} -compose Over -composite \
    PNG32:"$tag" -geometry +${tx}+$((by + wh + 10)) -compose Over -composite \
    -strip PNG32:assets/hero.png
}

png_for() {
  set -e
  local size=$1 scheme=${2:-dark} logical=${3:-$1} art padding bounds transform source mark
  local final=$work/final-$scheme-$size-$logical.png
  if [ ! -f "$final" ]; then
    if [ "$logical" -gt 64 ]; then
      padding=$((size * (apple_canvas - apple_art) / (2 * apple_canvas)))
      art=$((size - 2 * padding))
      source=$work/desktop.png
      if [ ! -f "$source" ]; then
        # Opening removes extraction speckles; the soft edge preserves antialiasing.
        magick assets/icon-desktop.png -alpha extract -threshold 50% \
          -morphology Open Disk:2 -blur 0x0.6 "$work/desktop-alpha.png"
        magick assets/icon-desktop.png "$work/desktop-alpha.png" \
          -alpha off -compose CopyOpacity -composite PNG32:"$source"
      fi
      bounds=$(magick "$work/desktop-alpha.png" -threshold 50% -format '%@' info:)
      # Normalize the visible tile to a square, retaining the soft alpha fringe outside it.
      transform=$(awk -F '[x+]' -v art="$art" -v padding="$padding" '{
        printf "%.9f,0,0,%.9f,%.9f,%.9f", art/$1, art/$2, padding-$3*art/$1, padding-$4*art/$2
      }' <<< "$bounds")
      magick "$source" -virtual-pixel transparent -filter Mitchell \
        -define distort:viewport="${size}x${size}+0+0" -distort AffineProjection "$transform" \
        +repage -strip PNG32:"$final"
    else
      mark=$work/compact-$scheme-$size-$logical.svg
      write_mark "$scheme" "$logical" "$mark"
      rasterize "$mark" "$size" "compact-$scheme-$size-$logical"
      cp "$work/compact-$scheme-$size-$logical/${size}x${size}.png" "$final"
    fi
  fi
  echo "$final"
}

mkdir -p "$out" public

iconset=$work/notras.iconset
mkdir -p "$iconset"
add_iconset() { cp "$(png_for "$2" dark "${3:-$2}")" "$iconset/icon_$1.png"; }
add_iconset 16x16 16
add_iconset 16x16@2x 32 16
add_iconset 32x32 32
add_iconset 32x32@2x 64 32
add_iconset 128x128 128
add_iconset 128x128@2x 256 128
add_iconset 256x256 256
add_iconset 256x256@2x 512 256
add_iconset 512x512 512
add_iconset 512x512@2x 1024 512
iconutil -c icns "$iconset" -o "$out/icon.icns"

cp "$(png_for 32)" "$out/32x32.png"
cp "$(png_for 64)" "$out/64x64.png"
cp "$(png_for 128)" "$out/128x128.png"
cp "$(png_for 256)" "$out/128x128@2x.png"
cp "$(png_for 1024)" "$out/icon.png"

for size in 30 44 71 89 107 142 150 284 310; do
  cp "$(png_for $size)" "$out/Square${size}x${size}Logo.png"
done
cp "$(png_for 50)" "$out/StoreLogo.png"

magick "$(png_for 16)" "$(png_for 32)" "$(png_for 48)" "$(png_for 64)" \
  "$(png_for 128)" "$(png_for 256)" -strip "$out/icon.ico"

write_mark tray 18 "$work/tray.svg"
rasterize "$work/tray.svg" "$tray_size" tray
# Luminance becomes coverage so macOS can tint the notes around transparent cutouts.
magick "$work/tray/${tray_size}x${tray_size}.png" \
  -channel A -fx 'r*a' +channel -fill black -colorize 100 -strip PNG32:"$out/tray.png"

write_mark dark 0 public/logo-dark.svg
write_mark light 0 public/logo-light.svg
cp "$(png_for 32 dark 16)" public/favicon-dark.png
cp "$(png_for 32 light 16)" public/favicon-light.png
cp "$(png_for 180 dark)" public/apple-touch-icon.png

write_hero

echo "icons: desktop icons, tray, favicons, theme-aware marks and README hero generated"

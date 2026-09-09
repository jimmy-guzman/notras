#!/usr/bin/env bash
set -euo pipefail

superellipse_n=5.0

rim_px_at_1024=20
rim_amplitude=0.46
rim_shade="#8a8a8a"
shadow_px_at_1024=13
shadow_offset_at_1024=10
shadow_opacity=0.17

apple_art=824
apple_canvas=1024
tray_size=36

hero_width=1280
hero_height=360
hero_icon=200
hero_gap=56
hero_radius=28
hero_mono=node_modules/@fontsource/ia-writer-mono/files/ia-writer-mono-latin-400-normal.woff
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

scaled() { awk "BEGIN{printf \"%.3f\", $1 * $2 / $apple_canvas}"; }

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
  local scheme=$1 seam=$2 target=$3 foreground background primary
  if [ "$scheme" = tray ]; then
    foreground="#ffffff"
    background="#000000"
    primary="#000000"
  else
    foreground=$(palette "$scheme" foreground)
    background=$(palette "$scheme" background)
    primary=$(palette "$scheme" primary)
  fi
  sed -e "s/var(--foreground)/$foreground/g" \
    -e "s/var(--background)/$background/g" \
    -e "s/var(--primary)/$primary/g" \
    -e "s/var(--seam)/$seam/g" assets/icon.svg > "$target"
  if grep -Fq 'var(' "$target"; then
    echo "icons: unresolved token in $target" >&2
    exit 1
  fi
}

superellipse() {
  local n=$1 art=$2 canvas=$3 inset=$4 file=$5
  local big=$((art * 2)) half=$((art - inset * 2))
  magick -size ${big}x${big} xc:black \
    -fx "(pow(abs(i-$((big / 2)))/$half,$n)+pow(abs(j-$((big / 2)))/$half,$n))<=1 ? 1 : 0" \
    -resize ${art}x${art} -colorspace gray \
    -background black -gravity center -extent ${canvas}x${canvas} "$file"
}

tile_mask() {
  local canvas=$1
  local mask=$work/tmask-$canvas.png
  if [ ! -f "$mask" ]; then
    superellipse "$superellipse_n" $((canvas * apple_art / apple_canvas)) "$canvas" 0 "$mask"
  fi
  echo "$mask"
}

# macOS bakes a lit edge and a soft drop shadow into every icon, measured across seven
# Tahoe system apps. Both are rebuilt at each output size so the small ones stay crisp.
apply_edge() {
  local in=$1 canvas=$2 target=$3 mask rim blur offset
  mask=$(tile_mask "$canvas")
  rim=$(scaled "$canvas" "$rim_px_at_1024")
  blur=$(scaled "$canvas" "$shadow_px_at_1024")
  offset=$(awk "BEGIN{printf \"%d\", $canvas * $shadow_offset_at_1024 / $apple_canvas + 0.5}")

  magick "$mask" -morphology Distance Euclidean:1 \
    -fx "max(0,1-u*655.35/$rim)" -colorspace gray "$work/ramp-$canvas.png"
  magick -size ${canvas}x${canvas} gradient:"#ffffff"-"$rim_shade" -colorspace gray \
    "$work/shade-$canvas.png"
  magick "$work/ramp-$canvas.png" "$mask" -compose Multiply -composite \
    "$work/shade-$canvas.png" -compose Multiply -composite \
    -evaluate multiply "$rim_amplitude" "$work/rimalpha-$canvas.png"
  magick -size ${canvas}x${canvas} xc:white "$work/rimalpha-$canvas.png" \
    -alpha off -compose CopyOpacity -composite PNG32:"$work/rim-$canvas.png"

  magick "$mask" -blur 0x"$blur" -evaluate multiply "$shadow_opacity" "$work/shadalpha-$canvas.png"
  magick -size ${canvas}x${canvas} xc:black "$work/shadalpha-$canvas.png" \
    -alpha off -compose CopyOpacity -composite \
    -background none -page +0+"$offset" -flatten PNG32:"$work/shadow-$canvas.png"

  magick PNG32:"$in" PNG32:"$work/rim-$canvas.png" -compose Over -composite \
    PNG32:"$work/lit-$canvas.png"
  magick PNG32:"$work/shadow-$canvas.png" PNG32:"$work/lit-$canvas.png" \
    -compose Over -composite -strip PNG32:"$target"
}

# The README needs the mark at a size where the wordmark can sit beside it. The mono is
# the app's own iA Writer Mono, read straight out of node_modules, because DESIGN.md keeps
# the wordmark in that face and a stand-in would be off-brand.
write_hero() {
  local word=$work/hero-word.png tag=$work/hero-tag.png icon=$work/hero-icon.png
  local ww wh th group gx iy block by tx
  local hero_background hero_foreground hero_muted
  hero_background=$(palette dark background)
  hero_foreground=$(palette dark foreground)
  hero_muted=$(palette dark muted-foreground)
  for font in "$hero_mono" "$hero_sans"; do
    if [ ! -f "$font" ]; then
      echo "icons: '$font' not found, so the hero cannot be drawn"
      exit 1
    fi
  done
  magick -background none -fill "$hero_foreground" -font "$hero_mono" \
    -pointsize 86 -kerning -5 label:notras PNG32:"$word"
  magick -background none -fill "$hero_muted" -font "$hero_sans" \
    -pointsize 36 label:$'write\nanother note' PNG32:"$tag"
  ww=$(magick identify -format '%w' "$word")
  wh=$(magick identify -format '%h' "$word")
  th=$(magick identify -format '%h' "$tag")
  group=$((hero_icon + hero_gap + ww))
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
  local size=$1 scheme=${2:-dark} seam=2 art mark tile
  local final=$work/final-$scheme-$size.png
  if [ ! -f "$final" ]; then
    if [ "$size" -le 24 ]; then seam=8
    elif [ "$size" -le 32 ]; then seam=5
    fi
    # The preview's mark occupies 136 of the tile's 192 units.
    art=$(awk "BEGIN{printf \"%d\", $size * $apple_art / $apple_canvas * 136 / 192 + 0.5}")
    mark=$work/mark-$scheme-$size.svg
    tile=$work/tile-$scheme-$size.png
    write_mark "$scheme" "$seam" "$mark"
    rasterize "$mark" "$art" "mark-$scheme-$size"
    magick -size ${size}x${size} xc:"$(palette "$scheme" background)" \
      "$(tile_mask "$size")" -alpha off -compose CopyOpacity -composite \
      "$work/mark-$scheme-$size/${art}x${art}.png" -gravity center -compose Over -composite \
      PNG32:"$tile"
    apply_edge "$tile" "$size" "$final"
  fi
  echo "$final"
}

mkdir -p "$out" public

iconset=$work/notras.iconset
mkdir -p "$iconset"
add_iconset() { cp "$(png_for "$2")" "$iconset/icon_$1.png"; }
add_iconset 16x16 16
add_iconset 16x16@2x 32
add_iconset 32x32 32
add_iconset 32x32@2x 64
add_iconset 128x128 128
add_iconset 128x128@2x 256
add_iconset 256x256 256
add_iconset 256x256@2x 512
add_iconset 512x512 512
add_iconset 512x512@2x 1024
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

write_mark tray 8 "$work/tray.svg"
rasterize "$work/tray.svg" "$tray_size" tray
# Luminance becomes coverage so the seam and folded corner remain transparent
# when macOS tints the template for either menu-bar appearance.
magick "$work/tray/${tray_size}x${tray_size}.png" \
  -channel A -fx 'r*a' +channel -fill black -colorize 100 -strip PNG32:"$out/tray.png"

write_mark dark 2 public/logo-dark.svg
write_mark light 2 public/logo-light.svg
cp "$(png_for 32 dark)" public/favicon-dark.png
cp "$(png_for 32 light)" public/favicon-light.png
cp "$(png_for 180 dark)" public/apple-touch-icon.png

write_hero

echo "icons: desktop icons, tray, favicons, theme-aware marks and README hero generated"

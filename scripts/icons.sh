#!/usr/bin/env bash
set -euo pipefail

render_expected=1254
render_tile_size=972
render_tile_x=141
render_tile_y=113
render_superellipse_n=4.7

superellipse_n=5.0
tile_color="#1c1e21"

rim_px_at_1024=20
rim_amplitude=0.46
rim_shade="#8a8a8a"
shadow_px_at_1024=13
shadow_offset_at_1024=10
shadow_opacity=0.17

apple_art=824
apple_canvas=1024
tray_size=36
tile_tolerance=0.005

hero_width=1280
hero_height=360
hero_icon=200
hero_gap=56
hero_radius=28
hero_background="#191b1d"
hero_foreground="#e9ebee"
hero_muted="#848688"
hero_mono=node_modules/@fontsource/ia-writer-mono/files/ia-writer-mono-latin-700-normal.woff
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

assert_render_matches_constants() {
  local actual
  actual=$(magick identify -format '%wx%h' assets/icon-render.png)
  if [ "$actual" != "${render_expected}x${render_expected}" ]; then
    echo "icons: assets/icon-render.png is $actual, not ${render_expected}x${render_expected}"
    echo "icons: the tile crop constants in this script were measured against that size"
    echo "icons: re-measure them before regenerating, the way D33 records"
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

# The render was drawn at its own exponent, which is narrower than the output shape, so
# masking it at the output exponent would expose its opaque surround. Its own shape is
# composited onto a tile drawn at the output exponent instead, and the rim covers the seam.
normalize_render() {
  local own=$work/mask-render.png crop=$work/crop.png
  superellipse "$render_superellipse_n" "$apple_art" "$apple_art" 1 "$own"
  magick assets/icon-render.png \
    -crop ${render_tile_size}x${render_tile_size}+${render_tile_x}+${render_tile_y} +repage \
    -resize ${apple_art}x${apple_art}! -colorspace sRGB PNG24:"$crop"
  magick PNG24:"$crop" "$own" -alpha off -compose CopyOpacity -composite PNG32:"$work/rmask.png"
  magick PNG32:"$work/rmask.png" -background none -gravity center \
    -extent ${apple_canvas}x${apple_canvas} PNG32:"$work/rgrid.png"
  magick -size ${apple_canvas}x${apple_canvas} xc:"$tile_color" \
    "$(tile_mask "$apple_canvas")" -alpha off -compose CopyOpacity -composite PNG32:"$work/base.png"
  magick PNG32:"$work/base.png" PNG32:"$work/rgrid.png" -compose Over -composite \
    PNG32:"$work/render-master.png"
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

# The tile shape lives twice: as bezier data in the SVGs and as the mask above. Nothing
# derives one from the other, so a change to either alone would split the icon's
# silhouette across sizes inside one icns. This is what catches that.
assert_svg_tile_matches_mask() {
  local canvas=512 diff
  rasterize assets/icon-tiny.svg "$canvas" guard
  diff=$(magick "$work/guard/${canvas}x${canvas}.png" -alpha extract -threshold 50% \
    \( "$(tile_mask "$canvas")" -threshold 50% \) \
    -compose Difference -composite -format '%[fx:mean]' info:)
  if awk "BEGIN{exit !($diff > $tile_tolerance)}"; then
    echo "icons: the SVG tile and the generated mask disagree by $diff"
    echo "icons: tolerance is $tile_tolerance, so this is a real difference, not antialiasing"
    echo "icons: superellipse_n is $superellipse_n; regenerate the tile path in assets/*.svg to match"
    exit 1
  fi
  echo "icons: SVG tile agrees with the n=$superellipse_n mask (diff $diff)"
}

# The README needs the mark at a size where the wordmark can sit beside it. The mono is
# the app's own iA Writer Mono, read straight out of node_modules, because DESIGN.md keeps
# the wordmark in that face and a stand-in would be off-brand.
write_hero() {
  local word=$work/hero-word.png tag=$work/hero-tag.png icon=$work/hero-icon.png
  local ww wh th group gx iy block by tx
  for font in "$hero_mono" "$hero_sans"; do
    if [ ! -f "$font" ]; then
      echo "icons: '$font' not found, so the hero cannot be drawn"
      exit 1
    fi
  done
  magick -background none -fill "$hero_foreground" -font "$hero_mono" \
    -pointsize 104 -kerning -3 label:notras PNG32:"$word"
  magick -background none -fill "$hero_muted" -font "$hero_sans" \
    -pointsize 34 label:"just write, otra vez." PNG32:"$tag"
  ww=$(magick identify -format '%w' "$word")
  wh=$(magick identify -format '%h' "$word")
  th=$(magick identify -format '%h' "$tag")
  group=$((hero_icon + hero_gap + ww))
  gx=$(((hero_width - group) / 2))
  iy=$(((hero_height - hero_icon) / 2))
  block=$((wh + 10 + th))
  by=$(((hero_height - block) / 2))
  tx=$((gx + hero_icon + hero_gap))
  magick "$(png_for 512)" -resize ${hero_icon}x${hero_icon} PNG32:"$icon"
  magick -size ${hero_width}x${hero_height} xc:none -fill "$hero_background" \
    -draw "roundrectangle 0,0 $((hero_width - 1)),$((hero_height - 1)) $hero_radius,$hero_radius" \
    PNG32:"$icon" -geometry +${gx}+${iy} -compose Over -composite \
    PNG32:"$word" -geometry +${tx}+${by} -compose Over -composite \
    PNG32:"$tag" -geometry +${tx}+$((by + wh + 10)) -compose Over -composite \
    -strip PNG32:assets/hero.png
}

source_for() {
  local size=$1
  if [ "$size" -le 16 ]; then echo tiny
  elif [ "$size" -le 40 ]; then echo small
  elif [ "$size" -le 96 ]; then echo full
  else echo render
  fi
}

png_for() {
  local size=$1 src raw
  local final=$work/final-$size.png
  if [ ! -f "$final" ]; then
    src=$(source_for "$size")
    if [ "$src" = render ]; then
      raw=$work/raw-$size.png
      magick PNG32:"$work/render-master.png" -resize ${size}x${size} PNG32:"$raw"
    else
      raw=$work/$src/${size}x${size}.png
    fi
    apply_edge "$raw" "$size" "$final"
  fi
  echo "$final"
}

if [ -f assets/icon-render.png ]; then
  echo "icons: 128px and up from assets/icon-render.png"
  assert_render_matches_constants
  normalize_render
else
  echo "icons: no assets/icon-render.png, driving every size from assets/icon.svg"
  rasterize assets/icon.svg "$apple_canvas" fallback
  cp "$work/fallback/${apple_canvas}x${apple_canvas}.png" "$work/render-master.png"
fi

rasterize assets/icon-tiny.svg 16 tiny
rasterize assets/icon-small.svg 30,32 small
rasterize assets/icon.svg 44,48,50,64,71,89 full

assert_svg_tile_matches_mask

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

rasterize assets/tray.svg "$tray_size" tray
cp "$work/tray/${tray_size}x${tray_size}.png" "$out/tray.png"

rasterize assets/icon.svg 32,180 favicon-dark
rasterize assets/icon-light.svg 32 favicon-light
apply_edge "$work/favicon-dark/32x32.png" 32 public/favicon-dark.png
apply_edge "$work/favicon-light/32x32.png" 32 public/favicon-light.png
apply_edge "$work/favicon-dark/180x180.png" 180 public/apple-touch-icon.png

write_hero

echo "icons: $(ls "$out" | wc -l | tr -d ' ') files in $out, 3 in public, 1 hero"

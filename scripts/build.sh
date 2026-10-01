#!/bin/sh
set -eu

site_dir=$(CDPATH= cd "$(dirname "$0")/.." && pwd)

# Remove obsolete routes when rebuilding an existing output directory.
rm -f "$site_dir/_site/about.html" "$site_dir/en/_site/about.html" "$site_dir/_site/en/about.html"

python3 -B "$site_dir/scripts/generate_story_maps.py"
python3 -B "$site_dir/scripts/generate_dressing_room.py"

quarto render "$site_dir"
quarto render "$site_dir/en"

mkdir -p "$site_dir/en/_site/assets"
for asset in favicon.svg favicon-32x32.png apple-touch-icon.png; do
  cp "$site_dir/assets/$asset" "$site_dir/en/_site/assets/$asset"
done
mkdir -p "$site_dir/_site/en"
cp -R "$site_dir/en/_site/." "$site_dir/_site/en/"
mkdir -p "$site_dir/_site/assets"
mkdir -p "$site_dir/_site/assets/fonts"
cp "$site_dir/assets/fonts/newsreader-latin-standard-normal.woff2" "$site_dir/_site/assets/fonts/"
cp "$site_dir/assets/fonts/Newsreader-OFL.txt" "$site_dir/_site/assets/fonts/"
cp "$site_dir/assets/kt-search-core.js" "$site_dir/_site/assets/kt-search-core.js"
cp "$site_dir/assets/kt-memory-locator.css" "$site_dir/_site/assets/kt-memory-locator.css"
cp "$site_dir/assets/kt-memory-locator.js" "$site_dir/_site/assets/kt-memory-locator.js"
cp "$site_dir/assets/kt-memory-responsive.css" "$site_dir/_site/assets/kt-memory-responsive.css"
cp "$site_dir/assets/kt-codex-entry.css" "$site_dir/_site/assets/kt-codex-entry.css"
cp "$site_dir/assets/kt-codex-responsive.css" "$site_dir/_site/assets/kt-codex-responsive.css"
cp "$site_dir/assets/kt-adaptive-tables.js" "$site_dir/_site/assets/kt-adaptive-tables.js"
cp "$site_dir/assets/kt-page-toc.js" "$site_dir/_site/assets/kt-page-toc.js"
cp "$site_dir/assets/kt-global-nav.js" "$site_dir/_site/assets/kt-global-nav.js"
cp "$site_dir/assets/kt-theme.js" "$site_dir/_site/assets/kt-theme.js"
cp "$site_dir/scripts/search_aliases.json" "$site_dir/_site/assets/kt-search-aliases.json"

python3 -B "$site_dir/scripts/enhance_memories.py"
python3 -B "$site_dir/scripts/enhance_codex.py"
python3 -B "$site_dir/scripts/enhance_theme.py"
python3 -B "$site_dir/scripts/enhance_layout.py"
python3 -B "$site_dir/scripts/enhance_global_nav.py"
python3 -B "$site_dir/scripts/enhance_story_maps.py"
python3 -B "$site_dir/scripts/enhance_dressing_room.py"
python3 -B "$site_dir/scripts/build_search_index.py"
python3 -B "$site_dir/scripts/enhance_hierarchy.py"
cp "$site_dir/assets/kt-discovery.css" "$site_dir/_site/assets/kt-discovery.css"
cp "$site_dir/assets/kt-discovery.js" "$site_dir/_site/assets/kt-discovery.js"
cp "$site_dir/assets/kt-memory-gallery.css" "$site_dir/_site/assets/kt-memory-gallery.css"
cp "$site_dir/assets/kt-memory-gallery.js" "$site_dir/_site/assets/kt-memory-gallery.js"
python3 -B "$site_dir/scripts/enhance_discovery.py"
# Add responsive mobile header controls.
cp "$site_dir/assets/kt-mobile-header.css" "$site_dir/_site/assets/kt-mobile-header.css"
cp "$site_dir/assets/kt-mobile-header.js" "$site_dir/_site/assets/kt-mobile-header.js"
python3 -B "$site_dir/scripts/enhance_mobile_header.py"
find "$site_dir/_site" -type f -name .DS_Store -exec rm -f {} +
python3 -B "$site_dir/scripts/enhance_production.py"
python3 -B "$site_dir/scripts/verify_production.py"
python3 -B "$site_dir/scripts/verify_theme.py"
python3 -B "$site_dir/scripts/verify_render.py"
python3 -B "$site_dir/scripts/verify_story_maps.py"
python3 -B "$site_dir/scripts/verify_navigation.py"
python3 -B "$site_dir/scripts/verify_language_switch.py"
python3 -B "$site_dir/scripts/verify_search_index.py"
node "$site_dir/scripts/test_search.cjs"
python3 -B "$site_dir/scripts/verify_search_ui.py"
python3 -B "$site_dir/scripts/verify_memories.py"
python3 -B "$site_dir/scripts/verify_codex.py"
python3 -B "$site_dir/scripts/verify_layout.py"
python3 -B "$site_dir/scripts/verify_hierarchy.py"
python3 -B "$site_dir/scripts/verify_discovery.py"
python3 -B "$site_dir/scripts/verify_mobile_header.py"
# Browser regressions remain separate: test_fragment_history_runtime.cjs,
# test_search_runtime.cjs, and test_memories_runtime.cjs.

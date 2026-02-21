#!/usr/bin/env bash
set -euo pipefail

ui_dir=$(node -e "
  const c = require('./components.json');
  const alias = c.aliases.ui || '@/components/ui';
  // Resolve @/ to src/
  console.log(alias.replace(/^@\//, 'src/'));
")

if [ ! -d "$ui_dir" ]; then
  echo "UI directory '$ui_dir' not found"
  exit 1
fi

components=()
for file in "$ui_dir"/*.tsx; do
  name=$(basename "$file" .tsx)
  components+=("$name")
done

if [ ${#components[@]} -eq 0 ]; then
  echo "No components found in $ui_dir"
  exit 1
fi

echo "Found ${#components[@]} components: ${components[*]}"
echo ""

for name in "${components[@]}"; do
  echo "→ Updating $name..."
  pnpm dlx shadcn@latest add "$name" -y -o
  echo ""
done

echo "Running formatter..."
pnpm format:fix

echo "Running linter..."
pnpm lint:fix

echo "Running formatter..."
pnpm format:fix

echo "Running tailwind upgrade..."
pnpx @tailwindcss/upgrade --force

echo "Done. Updated ${#components[@]} components."

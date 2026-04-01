#!/usr/bin/env bash
set -euo pipefail

ui_dir=$(node -e "
  const c = require('./components.json');
  const alias = c.aliases.ui || '@/components/ui';
  console.log(alias.replace(/^@\//, 'src/'));
")

if [ ! -d "$ui_dir" ]; then
  echo "UI directory '$ui_dir' not found"
  exit 1
fi

mapfile -t components < <(for file in "$ui_dir"/*.tsx; do basename "$file" .tsx; done)

if [ ${#components[@]} -eq 0 ]; then
  echo "No components found in $ui_dir"
  exit 1
fi

echo "Found ${#components[@]} components: ${components[*]}"
echo ""

pnpm dlx shadcn@latest add "${components[@]}" -y -o

echo "Running formatter..."
pnpm format:fix

echo "Running linter..."
pnpm lint:fix

echo "Running formatter..."
pnpm format:fix

echo "Running tailwind upgrade..."
pnpx @tailwindcss/upgrade --force

echo "Done. Updated ${#components[@]} components."

#!/bin/bash

# Cerca il percorso esatto della cartella Google Drive su macOS
DRIVE_DIR=$(find "$HOME/Library/CloudStorage" -maxdepth 1 -name "GoogleDrive-*" 2>/dev/null | head -n 1)

if [ -n "$DRIVE_DIR" ]; then
  DEST_DIR="$DRIVE_DIR/Il mio Drive"
else
  DEST_DIR="$HOME/Google Drive/Il mio Drive"
fi

mkdir -p "$DEST_DIR"
OUTPUT_FILE="$DEST_DIR/gazzetta_civica_codebase.md"

echo "# CODEBASE COMPLETA LA GAZZETTA CIVICA" > "$OUTPUT_FILE"
echo "Ultimo aggiornamento esportato: $(date)" >> "$OUTPUT_FILE"

find . -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" | while read -r file; do
    echo -e "\n\n---\n## File: $file\n\`\`\`typescript" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo -e "\n\`\`\`" >> "$OUTPUT_FILE"
done

echo "✅ File unificato esportato con successo in:"
echo "👉 $OUTPUT_FILE"

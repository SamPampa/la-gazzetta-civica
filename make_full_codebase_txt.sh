#!/bin/bash

# Individua il percorso reale di Google Drive su macOS
DRIVE_DIR=$(find "$HOME/Library/CloudStorage" -maxdepth 1 -name "GoogleDrive-*" 2>/dev/null | head -n 1)

if [ -n "$DRIVE_DIR" ]; then
  DEST_DIR="$DRIVE_DIR/Il mio Drive"
else
  DEST_DIR="$HOME/Google Drive/Il mio Drive"
fi

mkdir -p "$DEST_DIR"
OUTPUT_FILE="$DEST_DIR/PROGETTO_COMPLETO_GAZZETTA_CIVICA.txt"

echo "=================================================================" > "$OUTPUT_FILE"
echo "  CODEBASE COMPLETA: LA GAZZETTA CIVICA" >> "$OUTPUT_FILE"
echo "  Data e Ora Esportazione: $(date)" >> "$OUTPUT_FILE"
echo "=================================================================" >> "$OUTPUT_FILE"

# Raccoglie tutti i file rilevanti: codice sorgente, componenti, stili, config e documentazione
find . -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" -o -name "*.json" -o -name "*.mjs" -o -name "*.md" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" \
  -not -name "PROGETTO_COMPLETO_GAZZETTA_CIVICA.txt" \
  -not -name "gazzetta_civica_codebase.txt" | sort | while read -r file; do
    echo -e "\n\n" >> "$OUTPUT_FILE"
    echo "=================================================================" >> "$OUTPUT_FILE"
    echo ">>> FILE: $file" >> "$OUTPUT_FILE"
    echo "=================================================================" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "======================= FINE ESPORTAZIONE =======================" >> "$OUTPUT_FILE"

echo "✅ File unico generato con successo in:"
echo "👉 $OUTPUT_FILE"

#!/bin/bash

# Individua il percorso di Google Drive su macOS
DRIVE_DIR=$(find "$HOME/Library/CloudStorage" -maxdepth 1 -name "GoogleDrive-*" 2>/dev/null | head -n 1)

if [ -n "$DRIVE_DIR" ]; then
  DEST_ROOT="$DRIVE_DIR/Il mio Drive/la-gazzetta-civica-export"
else
  DEST_ROOT="$HOME/Google Drive/Il mio Drive/la-gazzetta-civica-export"
fi

# Pulisce o crea la cartella di destinazione
rm -rf "$DEST_ROOT"
mkdir -p "$DEST_ROOT"

echo "🔄 Esportazione albero dei file in corso..."

# Scansiona tutti i file utili escludendo cartelle pesanti
find . -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.css" -o -name "*.json" -o -name "*.mjs" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" | while read -r file; do
    # Rimuove il ./ iniziale
    clean_path="${file#./}"
    # Percorso della sottocartella di destinazione
    dir_name=$(dirname "$clean_path")
    mkdir -p "$DEST_ROOT/$dir_name"
    
    # Copia il file rinominandolo con estensione .txt
    dest_file="$DEST_ROOT/$clean_path.txt"
    cp "$file" "$dest_file"
done

echo "✅ Fatto! Cartella creata e sincronizzata con successo in:"
echo "👉 $DEST_ROOT"

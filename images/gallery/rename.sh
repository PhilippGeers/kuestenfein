#!/bin/bash

# Pfad zum Ordner mit den Dateien
folder_path="./"  # Hier den tatsächlichen Ordnerpfad angeben (z.B. "./" für den aktuellen Ordner)

# Zähler für die fortlaufende Nummer
idx=1

# Schleife durch alle Dateien im Ordner
for file in "$folder_path"/*; do
    # Prüfen, ob die Datei existiert, keine Verzeichnisse sind und nicht mit .sh endet
    if [ -f "$file" ] && [[ ! "$file" =~ \.sh$ ]]; then
        # Erweiterung der Datei ermitteln und in Kleinbuchstaben konvertieren
        extension="${file##*.}"
        extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')  # Konvertiere die Erweiterung in lowercase
        
        # Neues Dateiformat bild_{idx} (z.B. bild_1.jpg)
        new_file="$folder_path/bild_$idx.$extension"  # Neuen Namen mit der ursprünglichen Erweiterung generieren
        
        # Überprüfen, ob der neue Dateiname bereits existiert
        if [ -e "$new_file" ]; then
            echo "Warnung: Die Datei $new_file existiert bereits. Überspringe diese Datei."
        else
            # Datei umbenennen
            mv "$file" "$new_file"
            # Zähler erhöhen
            idx=$((idx + 1))
        fi
    fi
done

echo "Alle Dateien (außer *.sh) wurden umbenannt."

#!/bin/bash

# Überprüfen, ob der Parameter idx übergeben wurde
if [ -z "$1" ]; then
    echo "Fehler: Kein idx-Parameter übergeben."
    exit 1
fi

# Der idx-Parameter, der die Anzahl der Bilder angibt
num_images="$1"

# Pfad zum Ordner mit den Bildern
folder_path="images/gallery"

# Schleife, um die gewünschten Bilder zu erzeugen
for idx in $(seq 1 "$num_images"); do
    # HTML-Code für jedes Bild generieren
    html="<div class=\"gallery-item rounded-lg overflow-hidden\">
                <img src=\"$folder_path/bild_${idx}.jpg\" class=\"w-full h-64 object-cover gallery-image\" alt=\"\">
            </div>"
    
    # HTML ausgeben
    echo "$html"
done

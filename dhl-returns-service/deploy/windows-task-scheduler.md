# Windows: alle 15 Minuten per Aufgabenplanung

Variante A — Aufgabenplanung (GUI):
1. Aufgabenplanung öffnen → "Aufgabe erstellen".
2. Trigger: "Nach einem Zeitplan" → täglich, "Wiederholen alle: 15 Minuten" für die Dauer "1 Tag".
3. Aktion: Programm `node`, Argumente `index.js`, Starten in `C:\pfad\zu\dhl-returns-service`.
4. Die `.env` im Projektordner wird automatisch geladen (eingebauter Loader).

Variante B — per Kommandozeile:
```cmd
schtasks /Create /SC MINUTE /MO 15 /TN "DHL Returns Poller" ^
  /TR "node \"C:\pfad\zu\dhl-returns-service\index.js\"" /ST 06:00
```
(Arbeitsverzeichnis ggf. über ein kleines run.cmd setzen, das zuerst `cd /d C:\pfad...` macht und dann `node index.js` aufruft — damit die `.env` gefunden wird.)

# DHL Returns – Sandbox-Test (isoliert)

Prüft die DHL-Seite **ohne** Shopify: Token holen + ein Test-Rücksendeetikett erzeugen.
Die Sandbox funktioniert **sofort** (keine Produktiv-Freigabe nötig).

## Was du brauchst
Aus deiner DHL-Developer-Portal-App (mit **„Parcel DE Returns" in Sandbox**):
- **API Key**  → `DHL_CLIENT_ID`
- **API Secret** → `DHL_CLIENT_SECRET`
(„Show key" bei beidem). Der Sandbox-Login `user-valid` / `SandboxPasswort2023!` ist im Skript fest hinterlegt.

## Ausführen (Node ≥ 18)
```bash
DHL_CLIENT_ID=DEIN_KEY DHL_CLIENT_SECRET=DEIN_SECRET node dhl-sandbox-test.js
```
Optional: `RECEIVER_ID=deu` (DE, Standard), `LABEL_TYPE=BOTH` (PDF+QR).

## Erwartung
- `✓ Token erhalten` (sonst Key/Secret prüfen).
- `/orders Status 200` + eine JSON-Antwort (base64-Strings sind gekürzt dargestellt).
- Bei Erfolg wird `test-label.pdf` gespeichert.

## Danach
Schick mir die ausgegebene JSON-Zusammenfassung (Statuscode + Felder). Damit ziehe ich im
Returns-Dienst die letzten `verify`-Marker fest (genaue Feldnamen `label.b64` / `shipmentNo`).

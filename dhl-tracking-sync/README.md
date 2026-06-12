# DHL Tracking → Shopify Status-Sync (Quick Win)

Aktualisiert den **Tracking-Status ausgehender Sendungen** im Shopify-Admin. Heute bleibt der Status auf
„Tracking hinzugefügt" stehen, weil das ERP nur die Tracking-*Nummer* setzt und keine **Fulfillment-Events**
nachschiebt. Dieser Dienst pollt die **DHL Shipment Tracking (Unified) API** und schreibt die passenden
Shopify-Fulfillment-Events (`IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, …), sodass die Anzeige live mitwandert.

## Funktionsweise
1. Lädt versandte Bestellungen der letzten `LOOKBACK_DAYS` Tage mit DHL-Tracking.
2. Überspringt bereits zugestellte (Event `DELIVERED` vorhanden).
3. Fragt pro Tracking-Nummer den DHL-Status ab und mappt ihn (siehe `src/mapping.js`).
4. Schreibt nur **Fortschritte** (kein Rückschritt, keine Duplikate) via `fulfillmentEventCreate`.

## ⚠️ Rate Limit beachten
Die DHL-App ist mit **250 Requests/Tag** limitiert. Deshalb:
- Standard-Takt: **1× täglich** (systemd-Timer 06:30).
- Harte Obergrenze im Code: `MAX_TRACK_CALLS` (Default **240**). Wird sie erreicht, stoppt der Lauf und der
  Rest wird beim nächsten Mal verarbeitet.
- Bei höherem Volumen / häufigeren Läufen: im DHL Developer Portal **„Request Rate Limit Upgrade"** anfragen.

## Voraussetzungen
- **Node.js ≥ 18** (nutzt natives `fetch`, keine Abhängigkeiten).
- **DHL Developer Portal:** App mit API **„Shipment Tracking – Unified"** (Produktion Europe) → `DHL_API_KEY`.
  Hinweis: Solange die API im Portal auf **`pending`** steht, antwortet DHL mit 401/403 — erst nach Freigabe testen.
- **Shopify Custom App** (Admin-API-Token) mit: `read_orders`,
  `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`
  (für `fulfillmentEventCreate`; bei „Access denied" Scope ergänzen).

## Einrichtung
```bash
cp .env.example .env      # Werte eintragen (API-Key etc.)
DRY_RUN=true node index.js   # Testlauf: zeigt nur, was geschrieben WÜRDE — ändert nichts
```
Wenn der Dry-Run plausibel ist: in `.env` `DRY_RUN=false` setzen → Events werden geschrieben.

## Betrieb auf eurem Server (systemd, täglich)
```bash
sudo useradd -r -s /usr/sbin/nologin dhlsync
sudo mkdir -p /opt/dhl-tracking-sync && sudo cp -r . /opt/dhl-tracking-sync
sudo chown -R dhlsync:dhlsync /opt/dhl-tracking-sync && sudo chmod 600 /opt/dhl-tracking-sync/.env
sudo cp deploy/dhl-tracking-sync.service deploy/dhl-tracking-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now dhl-tracking-sync.timer
journalctl -u dhl-tracking-sync.service -f     # Logs
```
Alternativ Cron (täglich 06:30): `30 6 * * * cd /opt/dhl-tracking-sync && /usr/bin/node index.js >> /var/log/dhl-sync.log 2>&1`

## Status-Mapping (DHL → Shopify)
| DHL statusCode | Shopify Event |
|---|---|
| pre-transit | LABEL_PRINTED |
| transit | IN_TRANSIT (bzw. OUT_FOR_DELIVERY / ATTEMPTED_DELIVERY / DELAYED per Texterkennung) |
| delivered | DELIVERED |
| failure | FAILURE |
| unknown | (nichts) |

## Hinweise
- **Idempotent:** schreibt einen Status nur, wenn er einen Fortschritt darstellt; Wiederholungen sind harmlos.
- Endpunkt/Felder der DHL-Tracking-API vor Produktivgang gegen die aktuelle Referenz prüfen
  (developer.dhl.com → „Shipment Tracking – Unified").
- Erweiterbar: derselbe Dienst kann später die **Returns-Anbindung** mit aufnehmen.

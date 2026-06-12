# DHL Returns Service (Polling) — Shopify → DHL Parcel DE Returns

Erzeugt für Shopify-Retouren automatisch ein **DHL-Rücksendeetikett + Tracking**, schreibt beides in die
Bestellung zurück (`reverseDeliveryCreateWithShipping`) und benachrichtigt den Kunden — **outbound-only per Polling**,
kein Webhook, kein öffentlicher Endpoint. Läuft als Cron/Timer dort, wo auch eure ERP→DHL-Jobs ausgehend rausgehen.

> Status: **Gerüst** zum Testen. DHL-Feldnamen gemäß offizieller Doku gesetzt; gegen die erste echte
> Sandbox-/Integration-Antwort final verifizieren (`label.b64`, `shipmentNo`).

## Modi (`MODE`)
- **`AUTO`** (empfohlen, dein Ziel): pollt Retouren im Status **angefragt**, prüft Guardrails (Alter, Gründe,
  receiverId), **genehmigt per API** (`returnApproveRequest` — braucht keine Trackingnummer, anders als der Admin-Button)
  und erzeugt das Label. Null Handarbeit.
- **`GATE`**: pollt **genehmigte** Retouren ohne Label und erzeugt nur das Label. (Genehmigung erfolgt dann
  vorab per API/Shopify-Flow — nicht über den Admin-Button, der eine Trackingnummer verlangt.)

## Ablauf je Lauf
Shopify nach Kandidaten fragen (`return_status`, ungetaggt, ohne bestehende Reverse-Delivery) →
(AUTO: Guardrails + Genehmigung) → DHL `POST /orders` (Label, base64) → Staged-Upload des PDF →
`reverseDeliveryCreateWithShipping` (Label-URL + Tracking, `notifyCustomer:true`) → Order taggen `dhl-return-label-created`.
**Idempotent:** getaggte / bereits gelabelte Retouren werden übersprungen.

## Voraussetzungen
- **Node.js ≥ 18** (natives `fetch`/`FormData`, keine Abhängigkeiten). `.env` wird automatisch geladen.
- **Outbound**-Zugang zu `api-eu.dhl.com` (bzw. Test-/Integration-URL) und `*.myshopify.com`. **Kein** Inbound nötig.
- **DHL Parcel DE Returns** (OAuth2 ROPC): `DHL_CLIENT_ID`/`SECRET` + Geschäftskunden-`USER`/`PASSWORD`.
  Sandbox-Testlogin: `user-valid` / `SandboxPasswort2023!`. `RECEIVER_IDS` = Land→receiverId (mit Abrechnungsnummer).
- **Shopify Custom App** (Admin-Token), Scopes: `read_returns`, `write_returns`, `read_orders`, `write_orders`,
  `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders` (Reverse Deliveries;
  bei „Access denied" ergänzen).

## Testen (zuerst Dry-Run!)
```bash
cp .env.example .env     # Werte eintragen; DRY_RUN=true lassen
node index.js            # zeigt nur, was es täte — erzeugt/schreibt NICHTS
```
Sieht es gut aus → `DRY_RUN=false`. Für DHL-Test erst die Test-/Integration-Umgebung nutzen
(`DHL_BASE` entsprechend, Test-Login/Test-receiverIds), dann auf Produktion (`https://api-eu.dhl.com`) wechseln.

## Betrieb — als geplanter Job (outbound-only)
**Linux (systemd-Timer, alle 15 Min):**
```bash
sudo useradd -r -s /usr/sbin/nologin dhlsvc
sudo mkdir -p /opt/dhl-returns-service && sudo cp -r . /opt/dhl-returns-service
sudo chown -R dhlsvc:dhlsvc /opt/dhl-returns-service && sudo chmod 600 /opt/dhl-returns-service/.env
sudo cp deploy/dhl-returns-service.service deploy/dhl-returns-service.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now dhl-returns-service.timer
journalctl -u dhl-returns-service.service -f
```
Cron-Alternative: `*/15 * * * * cd /opt/dhl-returns-service && /usr/bin/node index.js >> /var/log/dhl-returns.log 2>&1`
**Windows:** siehe `deploy/windows-task-scheduler.md`.

## Vor Produktivgang final prüfen
- DHL-Antwortfelder `label.b64` / `shipmentNo` gegen echte Antwort bestätigen (`src/dhl.js`).
- Staged-Upload-Resource-Enum `RETURN_LABEL` bestätigen (`src/shopify.js`).
- `RECEIVER_IDS` (echte IDs mit Abrechnungsnummer) und Länder befüllen.
- Straße/Hausnummer-Split (`splitStreet` in `src/handler.js`) an Sonderfällen prüfen.

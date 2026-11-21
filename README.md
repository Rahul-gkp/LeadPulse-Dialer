# LeadPulse Dialer — Local CSV & Google Sheet Calling CRM

A lightweight, fast, zero-backend calling interface built with separate HTML, CSS, and JavaScript files.

## Files Included
- `index.html` — Main interface layout & Google Sheets sync modal
- `styles.css` — Clean, responsive dashboard styling
- `app.js` — Dynamic CSV parser, search/filter engine, call/WhatsApp links, and CSV exporter
- `default-data.js` — Preloaded leads from your sample CSV (`gmb_profiles_1795241649050.csv`)
- `gmb_profiles_1795241649050.csv` — Your original sample CSV file

## How to Run on Your Computer
1. Extract this ZIP into a folder (e.g., `C:\lead-dialer-crm\`).
2. Double-click `index.html` to open it in any browser, **or** serve it on your custom domain via a local server (`npx serve .` or XAMPP `htdocs`) + Cloudflare Tunnel.
3. Click **Upload New CSV** at the top right anytime to load any other CSV file—the app automatically detects columns (`Name`, `Phone`, `Address`, `Website`, etc.) and adds `Status` and `Remarks` columns if they don't exist yet.
4. Click **Save Remark & Next Lead** after each call, and click **Export Updated CSV** whenever you want to download your updated sheet with all remarks saved.

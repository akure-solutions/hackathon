# Energía Vital PR

**Tu seguridad no debe depender de la luz.**

Energía Vital is a consent-based registry of residents in Puerto Rico who depend on electric medical equipment (oxygen, dialysis, feeding pumps, refrigerated medication, mobility devices). When the power goes out, it starts a clock for each resident based on how long their equipment can run without power. It checks in with each resident, escalates on a schedule to their caregivers and the municipal emergency office, and gives each partner (LUMA, the municipal emergency office, caregivers) access only to the fields the resident consented to share. Every view is logged.

- **Live demo:** https://energiavitalpr.com
- **Dashboard:** https://energiavitalpr.com/dashboard.html
- **Built for:** Caribbean AI Summit Healthcare Hackathon, October 8–10, 2026

> All data in this project is synthetic. No real residents, addresses or phone numbers are used. Tier thresholds and escalation timers are demo rules, not clinical guidance.

---

## Working vs. simulated

| Feature | Status | Notes |
|---|---|---|
| Spanish sign-up with per-partner consent (LUMA, OMME, caregiver) | ✅ Working | Validation, encryption and consent records are real |
| Rules engine: outage clock, survival window, tiers | ✅ Working | Pure `evaluate()` function, runs every 5 seconds |
| Scheduled escalation (resident → caregivers → OMME on-call → repeats) | ✅ Working | Idempotent: each step fires exactly once per outage |
| Resident check-in page ("Estoy bien" / "Necesito ayuda" / "Se fue la luz") | ✅ Working | Personal link with a hashed token |
| Role-based projection (OMME, LUMA, analyst) | ✅ Working | Default deny, per-field allow-lists, enforced on the server |
| Access log of every view | ✅ Working | Field names only, grouped per screen load |
| Real notification to a phone | ✅ Working (email) | The demo resident's messages are sent as real email via Resend |
| LUMA regional outage indicator | ✅ Working (unofficial) | Reads LUMA's public regional endpoint; indicator only, never triggers escalation |
| SMS / WhatsApp delivery | 🟡 Simulated | Messages are built and logged; real delivery needs A2P carrier registration |
| Outage trigger ("Simular apagón") | 🟡 Simulated | Demo button in place of a real outage feed |
| Demo clock (+15 min / +1 h / +4 h) | 🟡 Simulated | Fast-forward offset, shown as "RELOJ SIMULADO" |
| Simulated resident responses | 🟡 Simulated | Demo button that fills in check-ins and outage reports |
| Partner accounts (OMME, LUMA, analyst) | 🟡 Simulated | Demo role switcher (`DEMO_MODE=true`), no login |
| Schematic barrio map | 🟡 Approximate | Barrio positions are schematic, not real geography |
| MedSeek integration | ⚪ Not built | Future integration, slide only |

---

## Register a resident (try it yourself)

Anyone can register a synthetic resident at **https://energiavitalpr.com** (it opens the sign-up page):

1. Answer **"¿Tú o alguien en tu hogar usa equipo médico que necesita electricidad?"**
2. **El equipo:** type of equipment, how many hours it runs without power, and backup power.
3. **La persona:** name, phone (SMS or WhatsApp), address, town and **barrio** (San Sebastián shows a barrio list).
4. **Contacto en caso de apagón:** one caregiver and their relationship.
5. **¿Quién puede ver la información?** Turn each partner on or off:
   - **Energía Vital** (required): to message you during an outage
   - **Mis cuidadores:** they get an alert if you don't respond
   - **LUMA:** sees your address, meter and that you depend on electric equipment, never the equipment type
   - **Oficina de Manejo de Emergencias (OMME):** sees your contact, location, equipment type and emergency contact, and can call you. Only available in participating municipios.

After you register, the page explains what will happen next. In demo mode it also gives you **your personal check-in link**. Register in **San Sebastián**, then press **Simular apagón** on the dashboard: your new resident appears on the map and in the case list, and **only the partners you authorized can see you**.

> Please use made-up data. The live demo resets on every restart, so registrations are temporary.

## Try the demo (about 2 minutes)

1. Open **https://energiavitalpr.com/dashboard.html**. You start as **R. Quiñones, OMME San Sebastián**.
2. Click **⚡ Simular apagón**. All 40 San Sebastián residents get a check-in message, and the clock starts. Note 2 residents have not authorized sharing info (38 tracked)
3. Click **▶ Simular respuestas**. Some residents report the outage, some say they're fine, and some ask for help. Help requests escalate immediately.
4. Click **+1 h** and **+4 h ⏩** to watch caregiver alerts and OMME on-call tasks fire on schedule.
5. Open **Doña Carmen's check-in page**: [https://energiavitalpr.com/demo/carmen](https://energiavitalpr.com/demo/carmen)  (demo link; it creates a fresh personal link every time). Tap **Necesito ayuda**. She jumps to the top of the case list. With Resend configured, the same link also arrives by email when the outage starts.
6. Go back to **dashboard**. Use the role menu (top right) to switch views:
   - **Operador 0417 · LUMA**: island-wide, LUMA's field set only. Blocked fields show 🔒.
   - **J. Ortiz · Analista**: aggregate counts by barrio only.
   - **M. Feliciano · OMME Caguas**: cannot see San Sebastián residents.
7. Scroll to **Registro de acceso** to see who viewed which fields.

The free hosting tier sleeps after about 15 minutes idle. The first visit can take up to a minute to wake up.

---

## Run locally

**Requirements:** Node.js 22 or newer (developed on Node 24) and npm.

```bash
git clone https://github.com/akure-solutions/hackathon.git
cd hackathon
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Generate the two secrets. Run this twice and paste one value into `JWT_SECRET` and the other into `ENC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Seed the demo data and start the server:

```bash
npm run demo     # resets the database, seeds 42 synthetic residents, prints Doña Carmen's link
npm run dev      # starts the server with auto-restart on http://localhost:3000
```

Open:
- Sign-up: http://localhost:3000/ (redirects to `/signup.html`)
- Dashboard: http://localhost:3000/dashboard.html
- Check-in: the `/c/<token>` link printed by `npm run demo`

If you change `ENC_KEY`, run `npm run demo` again. Data encrypted with the old key can't be decrypted.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the server with `node --watch` |
| `npm start` | Starts the server |
| `npm run seed` | Seeds municipios and residents (only if the residents table is empty) |
| `npm run demo` | Wipes demo data, reseeds, and resets the simulated clock |

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Defaults to 3000 |
| `DB_PATH` | Yes | SQLite file, e.g. `./data/energia.db` |
| `JWT_SECRET` | Yes | Signs the session cookie |
| `ENC_KEY` | Yes | 64 hex characters (32 bytes) for AES-256-GCM field encryption |
| `PUBLIC_BASE_URL` | Yes | Base URL for check-in links, e.g. `http://localhost:3000` or `https://energiavitalpr.com` |
| `DEMO_MODE` | No | `true` enables the role switcher and demo controls. Off by default |
| `NOTIFY_CHANNEL` | No | `log` (default): messages are printed and kept in memory |
| `RESEND_API_KEY` | No | Enables the real demo email (Resend API key) |
| `DEMO_NOTIFY_EMAIL` | No | Inbox that receives the demo resident's messages |

Secrets live only in `.env` (git-ignored) or in the hosting provider's environment settings.

---

## How it works

### Tiers (demo rules, not clinical guidance)

`ratio = time since outage started / resident's survival window`

| Tier | Rule |
|---|---|
| ● Verde · Estable | ratio < 0.5 |
| ▲ Amarillo · Atención | 0.5 ≤ ratio < 1.0 |
| ■ Rojo · Urgente | ratio ≥ 1.0, or the resident tapped "Necesito ayuda" |

Tiers and statuses are always shown with an icon, a word and a color, never color alone.

### Escalation

The timers are modeled on SB 1432's proposed timeline (a pending bill): electronic notice within 60 minutes, a contact attempt at 4 hours, and repeats every 12 hours.

| When | Step | Who |
|---|---|---|
| T+0 | `notify_resident` | Resident gets a check-in link |
| T+60 min, no response | `alert_caregivers` | Caregivers (if consented) |
| T+4 h | `alert_oncall` | Municipal emergency office on-call contact (if consented and the municipio participates) |
| Every +12 h | `contact_attempt_N` | Repeat contact |

"Necesito ayuda" fires the caregiver and on-call alerts immediately. "Estoy bien" stops escalation. Each step is stored with a unique `(outage, resident, step)` key, so it fires exactly once, even across restarts.

### Consent and visibility

Default deny. A partner sees a resident only with an active consent, and only the fields on that partner's allow-list (`src/visibility.js`):

| Field | LUMA | OMME | Caregiver |
|---|---|---|---|
| Name, phone, address, barrio, GPS | ✓ | ✓ | ✓ |
| LUMA meter number | ✓ | — | — |
| Life-support flag, survival window, tier, status | ✓ | ✓ | ✓ |
| Equipment category | — | ✓ | ✓ |
| Backup power | ✓ | ✓ | ✓ |
| Subsidy status | ✓ | — | ✓ |
| Mobility, lives alone, emergency contact | — | ✓ | ✓ / — |

The analyst role sees no individual records, only counts by barrio, with small-cell suppression (1–2 shown as "≤2").

### Security and privacy

- **AES-256-GCM** encryption for names, phones, addresses, GPS, meter numbers, caregiver contacts and case notes.
- **Check-in tokens:** 32 random bytes, stored only as SHA-256 hashes. The check-in API returns first name and town only.
- **Access log:** every projected read records the viewer, the resident and the field **names** disclosed (never values).
- **Audit log:** UPPERCASE event types with no personal data in the details.
- **Sessions:** a signed JWT in an httpOnly, `SameSite=Strict` cookie. The role is re-derived on the server.
- **Request safety:** Helmet headers, an Origin check on state-changing API calls, and rate limits on sign-up and check-in.
- **Rendering:** the UI writes user data with `textContent` only.

---

## Project structure

```
server.js                 Express app, security middleware, routes, engine start
src/
  config.js               Env loading and validation
  db.js                   SQLite connection, runs db/schema.sql
  crypto.js               AES-256-GCM encrypt/decrypt
  time.js, clock.js       Real time for audit; simulated clock for outages
  rules.js                Pure evaluate(): tier, status, due escalation steps
  engine.js               5-second tick, idempotent escalation
  notify.js               Spanish message builder; log channel + demo email
  visibility.js           Allow-lists, projectFor(), access logging
  records.js              Decrypts residents into records
  dashboardData.js        Scope, derived case fields, KPIs
  dashboardFeeds.js       Alert feed, case history, access log, analytics
  lumaFeed.js             LUMA regional indicator (cached, unofficial)
  personas.js, auth.js    Demo personas, session cookie, role checks
  tokens.js, audit.js
  routes/                 residents, municipios, outages, checkin, dashboard, demo, luma
db/
  schema.sql              Tables
  municipios.js           78 municipios; participating ones with fictitious contacts
  seed.js, reset.js       Synthetic demo data
public/
  signup.html, checkin.html, dashboard.html
  css/  js/  img/
```

---

## Deployment

The live demo runs on Render (free web service) with the custom domain `energiavitalpr.com`.

- **Build command:** `npm install`
- **Start command:** `npm run demo && npm start` (every deploy and restart starts from a clean synthetic demo)
- **Environment:** the variables above, with `DEMO_MODE=true` and `PUBLIC_BASE_URL=https://energiavitalpr.com`

---

## Roadmap

- SMS and WhatsApp delivery after A2P 10DLC carrier registration (the channel is one swappable function in `notify.js`)
- Caregiver "Yo me encargo" acknowledgment
- Admin view for municipal teams and roles
- Per-municipio LUMA outage data, if an official feed becomes available
- Optional link with MedSeek: MedSeek would store only a link ID and a consent timestamp; no clinical data flows into Energía Vital

---

## Credits

**Pre-existing assets**
- Energía Vital brand kit (logo, color palette, typography rules), created before the hackathon. During the hackathon, its color and type values were copied into the `:root` design tokens in `public/css/base.css`.
- **All code in this repository (100%) was written during the hackathon, October 8–10, 2026.** No code from other projects, including MedSeek, was reused.

**Open-source libraries:** Express, better-sqlite3, helmet, express-rate-limit, cookie-parser, jsonwebtoken, dotenv.

**Fonts** (self-hosted via Fontsource, SIL Open Font License): Lexend, Atkinson Hyperlegible, IBM Plex Mono.

**Services:** Render (hosting), Resend (demo email), LUMA's public regional outage endpoint (unofficial; Energía Vital is not affiliated with LUMA).

**Tools:** built with AI assistance (Claude by Anthropic) for code review, debugging and documentation, GAMMA for PowerPoint, Recraft for Icon creation, and ChatGPT for image creation and pitch feedback.

## About the builder

Energía Vital was built by **Verushka**, founder of **Akure Solutions Corp** in Puerto Rico. I also build **[MedSeek](https://medseekpr.com)**, a healthcare platform that connects patients in Puerto Rico with providers, and **Código K**, a MedSeek feature that gives patients a health profile they own and control, shared by QR code and always free for patients ([demo view](https://medseekpr.com/codigo-k/fec68357956a0963dfff2c14df7a692bd53f367d9ebbe0005affb99f1bf823bb)).

Energía Vital is a **separate project**. No MedSeek or Código K code was used, and the two systems do not share data. In the future, a resident could optionally link the two: MedSeek would store only a link ID and a consent timestamp, and no clinical information would ever flow into Energía Vital.

---

Built by **Verushka** · Akure Solutions Corp · Puerto Rico

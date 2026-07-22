# Clean NL — Telegram Mini App MVP

Een productieklare MVP voor een Telegram Mini App gekoppeld aan de bestaande **Clean NL** bot, met beveiligd admin panel en Cloudinary-media.

---

## Waarom deze architectuur (en niet meer de GitHub-Pages-hack)

De eerdere versie was statisch (GitHub Pages) met het admin panel dat rechtstreeks naar een JSON-bestand in de repo committede via de GitHub API. Dat werkte voor een snelle demo, maar mist wat je nu vraagt: echte login, schaalbare data-opslag, en directe uploads. Daarvoor is een **echte backend met database** nodig. Concreet betekent dit:

- **GitHub** blijft je broncode-repository (version control, zoals je gewend bent).
- De **backend draait niet meer op GitHub Pages** (dat kan alleen statische bestanden hosten) maar op een service die Node.js-processen draait, bv. **Render** of **Railway**. Beide bieden een gratis tier en kunnen automatisch deployen bij elke `git push` naar je GitHub-repo — dus je workflow (naar GitHub pushen) blijft in feite hetzelfde.
- Mini-app én admin panel worden door diezelfde backend geserveerd, dus geen aparte CORS-gedoe.

---

## 1. Volledige project-structuur

```
project/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        → database-schema (Product, Media, Admin, ...)
│   ├── src/
│   │   ├── server.js            → Express entrypoint
│   │   ├── lib/
│   │   │   ├── prisma.js        → database-client
│   │   │   └── cloudinary.js    → Cloudinary-configuratie
│   │   ├── middleware/
│   │   │   └── auth.js          → JWT-verificatie voor admin routes
│   │   ├── routes/
│   │   │   ├── auth.js          → POST /api/auth/login
│   │   │   ├── products.js      → publieke product-routes (voor mini-app)
│   │   │   └── admin.js         → beveiligde CRUD + Cloudinary-signature routes
│   │   └── scripts/
│   │       └── createAdmin.js   → command-line script om admin-account aan te maken
│   ├── public/                  → de Mini App zelf (statisch geserveerd door Express)
│   │   ├── index.html
│   │   ├── style.css
│   │   └── app.js
│   ├── admin/                   → het admin panel (statisch geserveerd door Express)
│   │   ├── index.html
│   │   ├── style.css
│   │   └── admin.js
│   ├── package.json
│   └── .env.example
└── bot/
    ├── index.js                 → de Telegram bot (Telegraf)
    ├── package.json
    └── .env.example
```

**Waarom deze indeling:** de backend is de enige plek die geheimen bevat (database, JWT-secret, Cloudinary API-secret) en de enige plek die schrijfrechten heeft. De mini-app en het admin panel zijn "dom" — ze praten alleen met de backend via een API en bevatten zelf geen secrets (op de Cloudinary *cloud name* en *api key* na, die zijn per ontwerp publiek).

---

## 2. Database-structuur

Vier tabellen, met Prisma als ORM (makkelijk te lezen schema, automatische migraties, type-safety):

| Tabel | Doel |
|---|---|
| `Admin` | Inloggegevens voor het admin panel (gehashed wachtwoord) |
| `Product` | Naam, prijs, categorie, beschrijving, actief/inactief |
| `ProductQuantity` | Staffelprijzen per product (bv. "5L → €12,50", "10L → €22,-") |
| `Media` | Foto's/video's per product, met Cloudinary `public_id` zodat we ze ook weer kunnen verwijderen |

```prisma
model Product {
  id          Int      @id @default(autoincrement())
  name        String
  slug        String   @unique
  category    String?
  price       Float
  currency    String   @default("EUR")
  unit        String   @default("stuk")
  description String?
  active      Boolean  @default(true)
  order       Int      @default(0)
  quantities  ProductQuantity[]
  media       Media[]
}

model ProductQuantity {
  id        Int     @id @default(autoincrement())
  label     String
  amount    Int
  price     Float
  productId Int
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model Media {
  id           Int      @id @default(autoincrement())
  type         String   // "image" | "video"
  url          String   // Cloudinary secure_url
  cloudinaryId String   // Cloudinary public_id (voor verwijderen)
  order        Int      @default(0)
  productId    Int
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

**Waarom Prisma + SQLite voor nu, Postgres later:** SQLite draait zonder aparte database-server — ideaal om lokaal te ontwikkelen en zelfs prima voor een kleine MVP in productie. Zodra je merkt dat je meer gelijktijdige schrijfacties krijgt (bv. meerdere medewerkers tegelijk in het admin panel), verander je in `schema.prisma` alleen de `provider` naar `"postgresql"` en de `DATABASE_URL` — de rest van de code blijft ongewijzigd, omdat Prisma die verschillen abstraheert.

---

## 3. Belangrijkste pagina's/components

**Mini-app (`public/`)**
- `index.html` + `app.js`: haalt `/api/products` op, toont een 2-koloms productgrid met categoriefilter.
- Productdetail: een bottom-sheet modal met foto/video-carousel (horizontaal scrollen), staffelprijzen, en een "Neem contact op"-knop die terug naar de bot linkt.

**Admin panel (`admin/`)**
- Login-scherm (gebruikersnaam/wachtwoord → JWT-token, bewaard in `localStorage`).
- Productoverzicht (tabel): foto, naam, categorie, prijs, actief/inactief, bewerken-knop.
- Bewerkformulier: alle velden + dynamische lijst van staffelprijzen + media-uploadgrid met directe Cloudinary-upload en verwijderknop per foto/video.

---

## 4. Voorbeeld van de admin flow

1. Je opent `/admin`, logt in met gebruikersnaam/wachtwoord.
2. Klik "+ Nieuw product" → vul naam, prijs, categorie, beschrijving in → klik "Opslaan".
   - *Waarom eerst opslaan voordat je media kunt uploaden:* media hoort bij een product-ID in de database; dat ID bestaat pas na de eerste keer opslaan. Na het opslaan blijft het formulier open te staan zodat je meteen door kunt met uploaden.
3. Klik "+ Media uploaden" → kies foto's/video's van je telefoon of computer → ze worden direct naar Cloudinary geüpload (zie hieronder) en verschijnen meteen in de grid.
4. Sluit het formulier. Het product staat nu live in de mini-app (tenzij je "Actief" hebt uitgevinkt — handig om een product klaar te zetten zonder 'm al te tonen).
5. Verwijderen kan met de rode knop in het bewerkformulier — dit verwijdert zowel de database-record als de bestanden op Cloudinary.

---

## 5. Hoe de Cloudinary-integratie werkt

Bestanden gaan **rechtstreeks van de browser naar Cloudinary**, niet via onze server — dat is belangrijker dan het lijkt: het scheelt serverbandbreedte en -geheugen, en schaalt daardoor moeiteloos mee ongeacht hoeveel foto's je uploadt.

Om dat veilig te doen zonder je Cloudinary-secret in de browser te zetten, gebruiken we **signed uploads**:

```
Browser                          Backend                        Cloudinary
   │                                │                                │
   │  1. "Geef me een signature"    │                                │
   │ ──────────────────────────────>│                                │
   │                                │  (ondertekent met API_SECRET,  │
   │                                │   die alleen de server kent)   │
   │  2. { signature, timestamp,    │                                │
   │       apiKey, cloudName }      │                                │
   │ <──────────────────────────────│                                │
   │                                │                                │
   │  3. Upload bestand + signature rechtstreeks                     │
   │ ─────────────────────────────────────────────────────────────>│
   │                                │                                │
   │  4. { secure_url, public_id }                                   │
   │ <─────────────────────────────────────────────────────────────│
   │                                │                                │
   │  5. Sla { url, public_id } op bij het product                   │
   │ ──────────────────────────────>│                                │
```

De backend-kant (`routes/admin.js`):
```js
router.post("/cloudinary-signature", (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || "cleannl-producten";
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET
  );
  res.json({ signature, timestamp, folder, apiKey: process.env.CLOUDINARY_API_KEY, cloudName: process.env.CLOUDINARY_CLOUD_NAME });
});
```

De browser-kant (`admin/admin.js`) uploadt daarna direct naar `https://api.cloudinary.com/v1_1/<cloud_name>/<image|video>/upload` met die signature erbij. Zie de volledige code in het project.

---

## 6. Voorbeeldcode belangrijkste onderdelen

Alle code staat in het meegeleverde project. De belangrijkste bestanden om te lezen als je het wilt begrijpen/aanpassen:

- `backend/prisma/schema.prisma` — het datamodel
- `backend/src/routes/admin.js` — CRUD + Cloudinary-signature endpoint
- `backend/src/middleware/auth.js` — JWT-verificatie (13 regels, bewust minimaal)
- `backend/admin/admin.js` — upload-flow + formulierlogica
- `backend/public/app.js` — hoe de mini-app producten ophaalt en toont

---

## 7. Aanbevelingen voor fase 2

**Functioneel**
- **Bestelformulier i.p.v. alleen contact**: velden voor hoeveelheid, adres, gewenste leverdatum, die als bericht naar de bot (of naar een e-mail/Slack-webhook) gaan.
- **Voorraadbeheer**: een `stock`-veld per product, automatisch "uitverkocht" tonen.
- **Zoekfunctie** in de mini-app naast categoriefilter.
- **Meerdere admins met rollen** (bv. een collega die alleen mag bewerken, niet verwijderen).
- **Bestelgeschiedenis/CRM-light**: wie heeft wanneer naar welk product gevraagd (koppel Telegram user-ID's aan aanvragen).

**Technisch**
- **Rate limiting** op `/api/auth/login` tegen brute-force (bv. met `express-rate-limit`).
- **Wachtwoord-reset flow** i.p.v. alleen het command-line script.
- **Cloudinary transformaties** automatisch toepassen (`w_600,q_auto,f_auto`) voor snellere laadtijden op mobiel.
- **Paginering** op `/api/products` zodra je assortiment groeit (nu haalt de mini-app alles in één keer op — prima tot een paar honderd producten, daarna merkbaar trager).
- **Redis-cache** voor de publieke product-lijst als het bezoekersaantal flink groeit.
- **Automatische backups** van de database (bij Postgres-hosting meestal ingebouwd bij de provider).

---

## Setup — stap voor stap

### A. Cloudinary
1. Gratis account op [cloudinary.com](https://cloudinary.com).
2. Noteer je **Cloud name**, **API Key** en **API Secret** (dashboard-homepage).

### B. Backend lokaal draaien
```bash
cd backend
npm install
cp .env.example .env        # vul Cloudinary-gegevens en een eigen JWT_SECRET in
npx prisma migrate dev --name init    # maakt de database + tabellen aan
npm run create-admin -- jouwgebruikersnaam jouwwachtwoord
npm run dev
```
De mini-app draait nu op `http://localhost:3000/`, het admin panel op `http://localhost:3000/admin`.

### C. Backend live zetten (Render — gratis tier)
1. Push de `backend/`-map naar je GitHub-repo.
2. Op [render.com](https://render.com): New → Web Service → koppel je GitHub-repo.
3. Build command: `npm install && npx prisma migrate deploy`. Start command: `npm start`.
4. Zet dezelfde environment variables als in je `.env` in het Render-dashboard.
5. Voor de allereerste admin: gebruik Render's "Shell"-tabblad om eenmalig `npm run create-admin -- gebruikersnaam wachtwoord` te draaien.
6. Je krijgt een URL zoals `https://cleannl-backend.onrender.com`.

### D. Bot koppelen
1. `bot/.env`: zet `WEBAPP_URL` op je Render-URL (moet `https://` zijn).
2. Zet in `bot/index.js` en `public/app.js` je echte bot-username waar `TODO` staat.
3. `cd bot && npm install && npm start` (of host dit los proces net als de backend, bv. als los Render-service).

---

## Belangrijk over veiligheid

- Het admin-wachtwoord wordt met bcrypt gehashed opgeslagen — nooit in platte tekst.
- JWT-tokens verlopen na 7 dagen; daarna moet opnieuw worden ingelogd.
- Zet `JWT_SECRET` op een lange, willekeurige string en deel die nooit.
- Cloudinary's `API_SECRET` blijft altijd op de server — komt nooit in browser-code terecht (dat is precies waarom we signed uploads gebruiken in plaats van een "unsigned upload preset").

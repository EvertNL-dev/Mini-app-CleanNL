require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const adminRoutes = require("./routes/admin");
const prisma = require("./lib/prisma");
const { startBot } = require("./bot");

const app = express();

// Admin-account automatisch aanmaken bij opstarten, als ADMIN_USERNAME/ADMIN_PASSWORD
// gezet zijn in de environment variables. Handig als je geen Shell-toegang hebt (bv. gratis Render-tier).
// Bestaat het account al met die username, dan gebeurt er niets (geen wachtwoord-overschrijving).
async function bootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin '${username}' bestaat al, sla aanmaken over.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.admin.create({ data: { username, passwordHash } });
  console.log(`Admin '${username}' automatisch aangemaakt bij opstarten.`);
}

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);

// Statische hosting: mini-app en admin panel
app.use("/", express.static(path.join(__dirname, "..", "public")));
app.use("/admin", express.static(path.join(__dirname, "..", "admin")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
bootstrapAdmin()
  .catch(err => console.error("Kon admin niet automatisch aanmaken:", err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server draait op poort ${PORT}`);
      startBot(); // Telegram-bot draait als los onderdeel binnen hetzelfde proces
    });
  });

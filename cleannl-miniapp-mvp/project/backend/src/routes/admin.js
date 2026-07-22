const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const cloudinary = require("../lib/cloudinary");
const { requireAdmin } = require("../middleware/auth");
const { getSettings, sendBroadcast, DEFAULT_SETTINGS } = require("../bot");

const router = express.Router();

// Alles hieronder vereist een geldig admin-token
router.use(requireAdmin);

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
}

// GET /api/admin/products — alle producten, ook inactieve
router.get("/products", async (req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { order: "asc" },
    include: { quantities: true, media: true }
  });
  res.json(products);
});

// POST /api/admin/products — nieuw product aanmaken
router.post("/products", async (req, res) => {
  const { name, category, price, currency, unit, description, active, quantities } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: "Naam en prijs zijn verplicht." });
  }

  const product = await prisma.product.create({
    data: {
      name,
      slug: slugify(name),
      category,
      price: Number(price),
      currency: currency || "EUR",
      unit: unit || "stuk",
      description,
      active: active !== false,
      quantities: {
        create: (quantities || []).map(q => ({
          label: q.label,
          amount: Number(q.amount) || 1,
          price: Number(q.price) || 0
        }))
      }
    },
    include: { quantities: true, media: true }
  });

  res.status(201).json(product);
});

// PUT /api/admin/products/:id — product bijwerken
router.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, category, price, currency, unit, description, active, quantities } = req.body;

  // Bestaande hoeveelheden vervangen door de nieuwe set (eenvoudig en voorspelbaar voor een MVP)
  await prisma.productQuantity.deleteMany({ where: { productId: id } });

  const product = await prisma.product.update({
    where: { id },
    data: {
      name,
      category,
      price: Number(price),
      currency,
      unit,
      description,
      active,
      quantities: {
        create: (quantities || []).map(q => ({
          label: q.label,
          amount: Number(q.amount) || 1,
          price: Number(q.price) || 0
        }))
      }
    },
    include: { quantities: true, media: true }
  });

  res.json(product);
});

// DELETE /api/admin/products/:id — product + media verwijderen (ook bij Cloudinary)
router.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.findUnique({ where: { id }, include: { media: true } });

  if (!product) {
    return res.status(404).json({ error: "Product niet gevonden." });
  }

  // Media ook echt van Cloudinary verwijderen, niet alleen uit de database
  for (const m of product.media) {
    try {
      await cloudinary.uploader.destroy(m.cloudinaryId, {
        resource_type: m.type === "video" ? "video" : "image"
      });
    } catch (err) {
      console.error("Kon Cloudinary-bestand niet verwijderen:", m.cloudinaryId, err.message);
    }
  }

  await prisma.product.delete({ where: { id } });
  res.json({ success: true });
});

// POST /api/admin/cloudinary-signature — genereert een ondertekende upload-aanvraag
// De browser uploadt hiermee RECHTSTREEKS naar Cloudinary, niet via onze server.
router.post("/cloudinary-signature", (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = process.env.CLOUDINARY_FOLDER || "cleannl-producten";

  const paramsToSign = { timestamp, folder };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

  res.json({
    signature,
    timestamp,
    folder,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME
  });
});

// POST /api/admin/products/:id/media — media-referentie opslaan NADAT de upload naar Cloudinary is gelukt
router.post("/products/:id/media", async (req, res) => {
  const productId = Number(req.params.id);
  const { url, cloudinaryId, type, order } = req.body;

  if (!url || !cloudinaryId || !type) {
    return res.status(400).json({ error: "url, cloudinaryId en type zijn verplicht." });
  }

  const media = await prisma.media.create({
    data: { productId, url, cloudinaryId, type, order: order || 0 }
  });

  res.status(201).json(media);
});

// DELETE /api/admin/media/:id — losse foto/video verwijderen
router.delete("/media/:id", async (req, res) => {
  const id = Number(req.params.id);
  const media = await prisma.media.findUnique({ where: { id } });

  if (!media) {
    return res.status(404).json({ error: "Media niet gevonden." });
  }

  try {
    await cloudinary.uploader.destroy(media.cloudinaryId, {
      resource_type: media.type === "video" ? "video" : "image"
    });
  } catch (err) {
    console.error("Kon Cloudinary-bestand niet verwijderen:", media.cloudinaryId, err.message);
  }

  await prisma.media.delete({ where: { id } });
  res.json({ success: true });
});

// ---- Bot-instellingen ----

// GET /api/admin/bot-settings — huidige instellingen ophalen (maakt ze aan met defaults als ze nog niet bestaan)
router.get("/bot-settings", async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

// PUT /api/admin/bot-settings — instellingen bijwerken
router.put("/bot-settings", async (req, res) => {
  const { welcomeText, logoUrl, contactTelegramUrl, contactSignalUrl, contactThreemaUrl, socialInstagramUrl } = req.body;

  const existing = await prisma.botSettings.findFirst();
  const data = {
    welcomeText: welcomeText || DEFAULT_SETTINGS.welcomeText,
    logoUrl: logoUrl || null,
    contactTelegramUrl: contactTelegramUrl || null,
    contactSignalUrl: contactSignalUrl || null,
    contactThreemaUrl: contactThreemaUrl || null,
    socialInstagramUrl: socialInstagramUrl || null
  };

  const settings = existing
    ? await prisma.botSettings.update({ where: { id: existing.id }, data })
    : await prisma.botSettings.create({ data });

  res.json(settings);
});

// ---- Bot-gebruikers ----

// GET /api/admin/bot-users — iedereen die ooit met de bot heeft gepraat
router.get("/bot-users", async (req, res) => {
  const users = await prisma.botUser.findMany({ orderBy: { createdAt: "desc" } });
  res.json(users);
});

// POST /api/admin/broadcast — bericht sturen naar alle bot-gebruikers
router.post("/broadcast", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Bericht mag niet leeg zijn." });
  }

  try {
    const result = await sendBroadcast(message.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

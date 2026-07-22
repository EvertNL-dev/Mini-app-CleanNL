const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// GET /api/products — alleen actieve producten, voor de mini-app
router.get("/", async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    include: {
      quantities: true,
      media: { orderBy: { order: "asc" } }
    }
  });
  res.json(products);
});

// GET /api/products/:id — detail van één product
router.get("/:id", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      quantities: true,
      media: { orderBy: { order: "asc" } }
    }
  });

  if (!product || !product.active) {
    return res.status(404).json({ error: "Product niet gevonden." });
  }

  res.json(product);
});

module.exports = router;

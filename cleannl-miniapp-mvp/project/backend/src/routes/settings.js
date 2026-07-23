const express = require("express");
const { getSettings } = require("../bot");

const router = express.Router();

// GET /api/settings — publieke, niet-gevoelige instellingen voor de mini-app (op dit moment: alleen het logo)
router.get("/", async (req, res) => {
  const settings = await getSettings();
  res.json({ logoUrl: settings.logoUrl || null });
});

module.exports = router;

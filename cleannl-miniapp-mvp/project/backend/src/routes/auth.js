const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Gebruikersnaam en wachtwoord zijn verplicht." });
    }

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin) {
      return res.status(401).json({ error: "Onjuiste inloggegevens." });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Onjuiste inloggegevens." });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, username: admin.username });
  } catch (err) {
    console.error("Login-fout:", err);
    res.status(500).json({ error: "Serverfout tijdens inloggen: " + err.message });
  }
});

module.exports = router;

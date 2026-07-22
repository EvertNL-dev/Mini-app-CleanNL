const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Geen token meegegeven." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { adminId, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token ongeldig of verlopen." });
  }
}

module.exports = { requireAdmin };

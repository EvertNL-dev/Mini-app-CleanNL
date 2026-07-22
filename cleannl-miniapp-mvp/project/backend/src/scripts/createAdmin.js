// Gebruik: node src/scripts/createAdmin.js <gebruikersnaam> <wachtwoord>
require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error("Gebruik: node src/scripts/createAdmin.js <gebruikersnaam> <wachtwoord>");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash }
  });

  console.log(`Admin '${admin.username}' aangemaakt/bijgewerkt.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

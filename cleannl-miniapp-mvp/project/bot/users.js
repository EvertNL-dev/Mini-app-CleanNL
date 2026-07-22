// Simpele lokale opslag van chat-ID's die ooit met de bot gepraat hebben.
// Let op: op Render's gratis tier is de schijf niet permanent — bij een herstart/nieuwe
// deploy kan dit bestand leeg beginnen. Voor een kleine bot is dat voor nu acceptabel;
// zodra je dit serieus gebruikt, verplaats je deze lijst naar een echte database.
const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "users.json");

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(users, null, 2));
}

function addUser(chatId) {
  const users = loadUsers();
  if (!users.includes(chatId)) {
    users.push(chatId);
    saveUsers(users);
  }
}

module.exports = { loadUsers, addUser };

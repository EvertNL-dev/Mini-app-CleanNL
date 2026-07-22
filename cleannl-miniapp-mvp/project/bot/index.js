require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // bv. https://cleannl-backend.onrender.com/

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN ontbreekt. Zet 'm in je .env bestand.");
  process.exit(1);
}
if (!WEBAPP_URL) {
  console.error("WEBAPP_URL ontbreekt. Zet 'm in je .env bestand (moet https zijn).");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  const payload = ctx.startPayload; // bv. "contact_12" als de gebruiker via de contactknop kwam

  if (payload && payload.startsWith("contact_")) {
    const productId = payload.replace("contact_", "");
    ctx.reply(
      `Bedankt voor je interesse! Je vroeg naar product #${productId}. Een van ons neemt hier zo snel mogelijk contact over op — heb je nog specifieke wensen (hoeveelheid, leverdatum), laat het gerust weten.`
    );
    return;
  }

  ctx.reply(
    "Welkom bij Clean NL! Bekijk hieronder ons volledige assortiment met prijzen, foto's en video's.",
    Markup.inlineKeyboard([
      Markup.button.webApp("🧴 Bekijk producten", WEBAPP_URL)
    ])
  );
});

bot.command("shop", (ctx) => {
  ctx.reply(
    "Open de winkel:",
    Markup.inlineKeyboard([
      Markup.button.webApp("🧴 Bekijk producten", WEBAPP_URL)
    ])
  );
});

// Vaste knop onderin het chatvenster (blijft zichtbaar, handig voor terugkerende klanten)
bot.command("menu", (ctx) => {
  ctx.reply(
    "Menu geopend.",
    Markup.keyboard([
      Markup.button.webApp("🧴 Bekijk producten", WEBAPP_URL)
    ]).resize()
  );
});

bot.catch((err, ctx) => {
  console.error(`Fout bij update ${ctx.updateType}:`, err);
});

bot.launch().then(() => {
  console.log("Clean NL bot draait via polling...");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

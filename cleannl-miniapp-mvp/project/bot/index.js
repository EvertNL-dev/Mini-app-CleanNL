require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { loadUsers, addUser } = require("./users");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;       // bv. https://mini-app-cleannl.onrender.com/
const LOGO_URL = process.env.LOGO_URL;           // Cloudinary-URL van je logo
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID; // jouw eigen Telegram user-ID (numeriek)

// Contact- en social-links: pas deze aan in je environment variables, niet in de code.
const CONTACT_TELEGRAM_URL = process.env.CONTACT_TELEGRAM_URL || "https://t.me/jouw_username";
const CONTACT_SIGNAL_URL = process.env.CONTACT_SIGNAL_URL || "https://signal.me/#p/+31600000000";
const CONTACT_THREEMA_URL = process.env.CONTACT_THREEMA_URL || "https://threema.id/JOUWID";
const SOCIAL_INSTAGRAM_URL = process.env.SOCIAL_INSTAGRAM_URL || "https://instagram.com/jouw_account";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN ontbreekt. Zet 'm in je .env bestand.");
  process.exit(1);
}
if (!WEBAPP_URL) {
  console.error("WEBAPP_URL ontbreekt. Zet 'm in je .env bestand (moet https zijn).");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Elke keer dat iemand de bot iets stuurt, onthouden we zijn chat-ID zodat we later
// een bericht naar iedereen kunnen sturen.
bot.use((ctx, next) => {
  if (ctx.chat) addUser(ctx.chat.id);
  return next();
});

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.webApp("🛒 Bekijk menu", WEBAPP_URL)],
  [
    Markup.button.url("Telegram", CONTACT_TELEGRAM_URL),
    Markup.button.url("Signal", CONTACT_SIGNAL_URL),
    Markup.button.url("Threema", CONTACT_THREEMA_URL)
  ],
  [Markup.button.url("📸 Instagram", SOCIAL_INSTAGRAM_URL)]
]);

const welcomeText =
  "Welkom bij *Clean Netherlands*! 🧴\n\n" +
  "Bekijk ons volledige assortiment met prijzen, foto's en video's via het menu hieronder, " +
  "of neem rechtstreeks contact op via Telegram, Signal of Threema.";

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // bv. "contact_12" als iemand via de mini-app-contactknop kwam

  if (payload && payload.startsWith("contact_")) {
    const productId = payload.replace("contact_", "");
    await ctx.reply(
      `Bedankt voor je interesse! Je vroeg naar product #${productId}. We nemen zo snel mogelijk contact op.`
    );
    return;
  }

  if (LOGO_URL) {
    await ctx.replyWithPhoto(LOGO_URL, {
      caption: welcomeText,
      parse_mode: "Markdown",
      ...mainKeyboard
    });
  } else {
    await ctx.reply(welcomeText, { parse_mode: "Markdown", ...mainKeyboard });
  }
});

bot.command("menu", (ctx) => {
  ctx.reply("Open de winkel:", Markup.inlineKeyboard([
    Markup.button.webApp("🛒 Bekijk menu", WEBAPP_URL)
  ]));
});

bot.command("contact", (ctx) => {
  ctx.reply("Neem contact op via:", Markup.inlineKeyboard([
    [
      Markup.button.url("Telegram", CONTACT_TELEGRAM_URL),
      Markup.button.url("Signal", CONTACT_SIGNAL_URL),
      Markup.button.url("Threema", CONTACT_THREEMA_URL)
    ]
  ]));
});

// /send <bericht> — stuurt een bericht naar iedereen die ooit met de bot heeft gepraat.
// Alleen bruikbaar door de admin (ADMIN_TELEGRAM_ID in je environment variables).
bot.command("send", async (ctx) => {
  if (!ADMIN_TELEGRAM_ID || String(ctx.from.id) !== String(ADMIN_TELEGRAM_ID)) {
    return; // stilzwijgend negeren voor niet-admins, geen foutmelding die verklapt dat dit commando bestaat
  }

  const message = ctx.message.text.replace(/^\/send(@\w+)?\s*/, "").trim();
  if (!message) {
    return ctx.reply("Gebruik: /send jouw bericht hier");
  }

  const users = loadUsers();
  if (users.length === 0) {
    return ctx.reply("Nog niemand om naar te versturen — er hebben nog geen gebruikers met de bot gepraat.");
  }

  await ctx.reply(`Bericht wordt verstuurd naar ${users.length} gebruiker(s)...`);

  let success = 0;
  let failed = 0;
  for (const chatId of users) {
    try {
      await bot.telegram.sendMessage(chatId, message);
      success++;
    } catch (err) {
      failed++; // bv. gebruiker heeft de bot geblokkeerd
    }
    await new Promise(resolve => setTimeout(resolve, 40)); // voorkomt Telegram rate-limit fouten
  }

  await ctx.reply(`Klaar. Verstuurd: ${success}. Mislukt: ${failed}.`);
});

bot.catch((err, ctx) => {
  console.error(`Fout bij update ${ctx.updateType}:`, err);
});

bot.launch().then(() => {
  console.log("Clean NL bot draait via polling...");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

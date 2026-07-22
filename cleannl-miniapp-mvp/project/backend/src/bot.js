const { Telegraf, Markup } = require("telegraf");
const prisma = require("./lib/prisma");

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // dezelfde URL als deze service zelf

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

const DEFAULT_SETTINGS = {
  welcomeText:
    "Welkom bij *Clean Netherlands*! 🧴\n\n" +
    "Bekijk ons volledige assortiment met prijzen, foto's en video's via het menu hieronder, " +
    "of neem rechtstreeks contact op via Telegram, Signal of Threema.",
  logoUrl: null,
  contactTelegramUrl: "https://t.me/jouw_username",
  contactSignalUrl: "https://signal.me/#p/+31600000000",
  contactThreemaUrl: "https://threema.id/JOUWID",
  socialInstagramUrl: "https://instagram.com/jouw_account"
};

// Eén rij in de database met de bot-instellingen. Bestaat hij nog niet, dan maken we 'm aan met defaults.
async function getSettings() {
  let settings = await prisma.botSettings.findFirst();
  if (!settings) {
    settings = await prisma.botSettings.create({ data: DEFAULT_SETTINGS });
  }
  return settings;
}

async function rememberUser(ctx) {
  if (!ctx.chat) return;
  const chatId = String(ctx.chat.id);
  try {
    await prisma.botUser.upsert({
      where: { chatId },
      update: {
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || null
      },
      create: {
        chatId,
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || null
      }
    });
  } catch (err) {
    console.error("Kon bot-gebruiker niet opslaan:", err.message);
  }
}

function buildKeyboard(settings) {
  return Markup.inlineKeyboard([
    [Markup.button.webApp("🛒 Bekijk menu", WEBAPP_URL)],
    [
      Markup.button.url("Telegram", settings.contactTelegramUrl || DEFAULT_SETTINGS.contactTelegramUrl),
      Markup.button.url("Signal", settings.contactSignalUrl || DEFAULT_SETTINGS.contactSignalUrl),
      Markup.button.url("Threema", settings.contactThreemaUrl || DEFAULT_SETTINGS.contactThreemaUrl)
    ],
    [Markup.button.url("📸 Instagram", settings.socialInstagramUrl || DEFAULT_SETTINGS.socialInstagramUrl)]
  ]);
}

function setupHandlers() {
  bot.use(async (ctx, next) => {
    await rememberUser(ctx);
    return next();
  });

  bot.start(async (ctx) => {
    const payload = ctx.startPayload;

    if (payload && payload.startsWith("contact_")) {
      const productId = payload.replace("contact_", "");
      await ctx.reply(`Bedankt voor je interesse! Je vroeg naar product #${productId}. We nemen zo snel mogelijk contact op.`);
      return;
    }

    const settings = await getSettings();
    const keyboard = buildKeyboard(settings);

    if (settings.logoUrl) {
      await ctx.replyWithPhoto(settings.logoUrl, { caption: settings.welcomeText, parse_mode: "Markdown", ...keyboard });
    } else {
      await ctx.reply(settings.welcomeText, { parse_mode: "Markdown", ...keyboard });
    }
  });

  bot.command("menu", (ctx) => {
    ctx.reply("Open de winkel:", Markup.inlineKeyboard([Markup.button.webApp("🛒 Bekijk menu", WEBAPP_URL)]));
  });

  bot.command("contact", async (ctx) => {
    const settings = await getSettings();
    ctx.reply("Neem contact op via:", Markup.inlineKeyboard([[
      Markup.button.url("Telegram", settings.contactTelegramUrl || DEFAULT_SETTINGS.contactTelegramUrl),
      Markup.button.url("Signal", settings.contactSignalUrl || DEFAULT_SETTINGS.contactSignalUrl),
      Markup.button.url("Threema", settings.contactThreemaUrl || DEFAULT_SETTINGS.contactThreemaUrl)
    ]]));
  });

  // /send blijft ook als commando werken (handig als je niet bij het admin panel kunt), naast de knop in het admin panel.
  bot.command("send", async (ctx) => {
    const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
    if (!ADMIN_TELEGRAM_ID || String(ctx.from.id) !== String(ADMIN_TELEGRAM_ID)) return;

    const message = ctx.message.text.replace(/^\/send(@\w+)?\s*/, "").trim();
    if (!message) return ctx.reply("Gebruik: /send jouw bericht hier");

    const result = await sendBroadcast(message);
    await ctx.reply(`Klaar. Verstuurd: ${result.success}. Mislukt: ${result.failed}.`);
  });

  bot.catch((err, ctx) => {
    console.error(`Bot-fout bij update ${ctx.updateType}:`, err);
  });
}

// Stuurt een bericht naar iedereen die ooit met de bot heeft gepraat. Gebruikt door zowel
// het /send commando als de broadcast-knop in het admin panel.
async function sendBroadcast(message) {
  if (!bot) {
    throw new Error("De bot is niet geconfigureerd (BOT_TOKEN ontbreekt) — kan geen berichten versturen.");
  }

  const users = await prisma.botUser.findMany();
  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.chatId, message);
      success++;
    } catch (err) {
      failed++; // bv. gebruiker heeft de bot geblokkeerd
    }
    await new Promise(resolve => setTimeout(resolve, 40)); // voorkomt Telegram rate-limit fouten
  }

  return { success, failed, total: users.length };
}

function startBot() {
  if (!bot || !WEBAPP_URL) {
    console.warn("BOT_TOKEN of WEBAPP_URL ontbreekt — de Telegram-bot wordt niet gestart (de website blijft wel gewoon werken).");
    return;
  }

  setupHandlers();

  bot.launch().then(() => {
    console.log("Clean NL bot draait via polling (binnen de backend-service)...");
  }).catch((err) => {
    console.error("Bot kon niet starten (mogelijk tijdelijk 409-conflict):", err.message);
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

module.exports = { startBot, getSettings, sendBroadcast, DEFAULT_SETTINGS };

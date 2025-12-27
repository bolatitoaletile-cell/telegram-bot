/************************************************
 * FILE: index.js
 * LOCATION: Root of the project
 * PURPOSE:
 * - Telegram bot logic
 * - MongoDB connection
 * - User stats
 * - Multiple quizzes
 * - Daily quests
 * - Badges
 * - AI answers
 ************************************************/

import express from "express";
import { Telegraf } from "telegraf";
import mongoose from "mongoose";
import fetch from "node-fetch";

/* ---------- EXPRESS SERVER (FOR RENDER) ---------- */
const app = express();
app.get("/", (req, res) => res.send("🤖 Bot is alive"));
app.listen(process.env.PORT || 3000);

/* ---------- TELEGRAM BOT ---------- */
const bot = new Telegraf(process.env.BOT_TOKEN);

/* ---------- MONGODB CONNECTION ---------- */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

/* ---------- USER SCHEMA ---------- */
const userSchema = new mongoose.Schema({
  telegramId: String,
  name: String,
  username: String,
  xp: { type: Number, default: 0 },
  quizzesCompleted: { type: Number, default: 0 },
  badges: { type: [String], default: ["Beginner"] },
  dailyQuestDone: { type: Boolean, default: false },
  lastQuestDate: String
});

const User = mongoose.model("User", userSchema);

/* ---------- HELPERS ---------- */
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getUser(ctx) {
  let user = await User.findOne({ telegramId: ctx.from.id });

  if (!user) {
    user = new User({
      telegramId: ctx.from.id,
      name: ctx.from.first_name,
      username: ctx.from.username || "N/A"
    });
    await user.save();
  }

  // Reset daily quest each new day
  if (user.lastQuestDate !== today()) {
    user.dailyQuestDone = false;
    user.lastQuestDate = today();
    await user.save();
  }

  return user;
}

/* ---------- QUIZ DATA (MULTIPLE QUIZZES) ---------- */
const quizzes = [
  {
    question: "What is JavaScript?",
    options: ["A database", "A programming language", "An OS"],
    answer: "B"
  },
  {
    question: "Which keyword declares a variable in JavaScript?",
    options: ["var", "print", "loop"],
    answer: "A"
  },
  {
    question: "Which data type is true or false?",
    options: ["String", "Boolean", "Number"],
    answer: "B"
  },
  {
    question: "Which symbol starts a comment in JavaScript?",
    options: ["//", "<!--", "#"],
    answer: "A"
  }
];

/* ---------- BOT COMMANDS ---------- */

// /start
bot.start(async (ctx) => {
  await getUser(ctx);
  ctx.reply(
    "👋 Welcome to *Coding Quest Bot!*\n\n" +
    "🧠 /quiz – Take a quiz\n" +
    "📅 /daily – Daily quest\n" +
    "📊 /stats – Your stats\n" +
    "❓ /ask <question> – Ask coding questions",
    { parse_mode: "Markdown" }
  );
});

// /stats
bot.command("stats", async (ctx) => {
  const u = await getUser(ctx);
  ctx.reply(
    `📊 *Your Stats*\n\n` +
    `👤 Name: ${u.name}\n` +
    `🔖 Username: @${u.username}\n` +
    `⭐ XP: ${u.xp}\n` +
    `🧠 Quizzes: ${u.quizzesCompleted}\n` +
    `📅 Daily Quest: ${u.dailyQuestDone ? "Completed ✅" : "Pending ❌"}\n` +
    `🏅 Badges: ${u.badges.join(", ")}`,
    { parse_mode: "Markdown" }
  );
});

// /daily
bot.command("daily", async (ctx) => {
  const u = await getUser(ctx);
  if (u.dailyQuestDone) {
    return ctx.reply("✅ You already completed today’s quest!");
  }
  ctx.reply("📅 Daily Quest: Complete **1 quiz today** to earn XP!",
    { parse_mode: "Markdown" }
  );
});

// /quiz
bot.command("quiz", async (ctx) => {
  const user = await getUser(ctx);
  const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];

  ctx.reply(
    `🧠 *Quiz Time!*\n\n${quiz.question}\n\n` +
    `A) ${quiz.options[0]}\n` +
    `B) ${quiz.options[1]}\n` +
    `C) ${quiz.options[2]}\n\n` +
    `Reply with A, B, or C`,
    { parse_mode: "Markdown" }
  );

  bot.once("text", async (ctx2) => {
    if (ctx2.message.text.toUpperCase() === quiz.answer) {
      user.xp += 10;
      user.quizzesCompleted += 1;

      if (!user.dailyQuestDone) {
        user.dailyQuestDone = true;
        user.xp += 5;
        if (!user.badges.includes("Daily Hero")) {
          user.badges.push("Daily Hero");
        }
      }

      if (user.quizzesCompleted >= 3 && !user.badges.includes("Quiz Master")) {
        user.badges.push("Quiz Master");
      }

      await user.save();
      ctx2.reply("✅ Correct! +XP 🎉");
    } else {
      ctx2.reply(`❌ Incorrect. Correct answer is ${quiz.answer}.`);
    }
  });
});

// /ask
bot.command("ask", async (ctx) => {
  const question = ctx.message.text.replace("/ask", "").trim();
  if (!question) return ctx.reply("❓ Ask a coding question.");

  ctx.reply("🤔 Thinking...");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [{ role: "user", content: question }]
      })
    });

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return ctx.reply("⚠️ AI unavailable right now.");
    ctx.reply(answer);
  } catch {
    ctx.reply("❌ AI error. Try later.");
  }
});

/* ---------- START BOT ---------- */
bot.launch();
console.log("✅ Bot running");

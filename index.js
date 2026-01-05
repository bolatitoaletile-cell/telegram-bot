const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN;
const MONGO = process.env.MONGODB_URI;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// ===== OPENAI =====
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ===== TELEGRAM =====
const bot = new TelegramBot(TOKEN);

// ===== MONGODB =====
//mongoose.connect(MONGO)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// ===== USER SCHEMA =====
const userSchema = new mongoose.Schema({
  telegramId: Number,
  name: String,
  score: { type: Number, default: 0 },
  level: { type: String, default: "🥉 Beginner" },
  currentAnswer: String
});

const User = mongoose.model('User', userSchema);

// ===== QUIZZES =====
const quizzes = [
  { q: "What keyword declares a constant in JavaScript?", a: "const" },
  { q: "Which language is used with Django?", a: "python" },
  { q: "What does HTML stand for?", a: "hypertext markup language" }
];

// ===== HELPERS =====
function getLevel(score) {
  if (score >= 50) return "🥇 Expert";
  if (score >= 20) return "🥈 Intermediate";
  return "🥉 Beginner";
}

async function getUser(msg) {
  let user = await User.findOne({ telegramId: msg.chat.id });
  if (!user) {
    user = await User.create({
      telegramId: msg.chat.id,
      name: msg.chat.username || msg.chat.first_name
    });
  }
  return user;
}

// ===== WEBHOOK =====
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ===== BOT =====
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const text = msg.text.toLowerCase();
  const chatId = msg.chat.id;
  const user = await getUser(msg);

  // START
  if (text === '/start') {
    return bot.sendMessage(chatId,
      `👋 Welcome ${user.name}

Commands:
/quiz
/leaderboard
/profile
/learn python | js | html
/explain <topic>`
    );
  }

  // QUIZ
  if (text === '/quiz') {
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    user.currentAnswer = quiz.a;
    await user.save();
    return bot.sendMessage(chatId, `🧠 Quiz:\n${quiz.q}`);
  }

  // ANSWER
  if (user.currentAnswer) {
    if (text === user.currentAnswer) {
      user.score += 10;
      user.level = getLevel(user.score);
      user.currentAnswer = null;
      await user.save();
      return bot.sendMessage(chatId, `✅ Correct!\nScore: ${user.score}\nLevel: ${user.level}`);
    } else {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Explain programming concepts simply." },
          { role: "user", content: `Explain why "${user.currentAnswer}" is the correct answer.` }
        ]
      });
      return bot.sendMessage(chatId, `❌ Wrong\n🤖 AI explains:\n${ai.choices[0].message.content}`);
    }
  }

  // LEADERBOARD
  if (text === '/leaderboard') {
    const users = await User.find().sort({ score: -1 }).limit(5);
    const board = users.map((u, i) => `${i + 1}. ${u.name} – ${u.score}`).join('\n');
    return bot.sendMessage(chatId, `🏆 Leaderboard\n${board}`);
  }

  // PROFILE
  if (text === '/profile') {
    return bot.sendMessage(chatId,
      `👤 Profile
Name: ${user.name}
Score: ${user.score}
Level: ${user.level}`);
  }

  // AI EXPLAIN
  if (text.startsWith('/explain')) {
    const topic = text.replace('/explain', '').trim();
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Teach programming simply." },
        { role: "user", content: `Explain ${topic} for a beginner.` }
      ]
    });
    return bot.sendMessage(chatId, ai.choices[0].message.content);
  }
});

// ===== HEALTH =====
app.get('/', (req, res) => {
  res.send('Bot is alive');
});

app.listen(PORT, () => console.log("Server running"));

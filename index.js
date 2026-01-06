const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// ===== OPENAI =====
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ===== TELEGRAM =====
const bot = new TelegramBot(TOKEN);

// ===== IN-MEMORY DATABASE =====
const users = {};

// ===== QUIZZES =====
const quizzes = [
  { q: "What keyword declares a constant in JavaScript?", a: "const" },
  { q: "Which language is used with Django?", a: "python" },
  { q: "What does HTML stand for?", a: "hypertext markup language" },
  { q: "Which language runs in the browser?", a: "javascript" }
];

// ===== HELPERS =====
function getLevel(score) {
  if (score >= 50) return "🥇 Expert";
  if (score >= 20) return "🥈 Intermediate";
  return "🥉 Beginner";
}

function getUser(msg) {
  const id = msg.chat.id;
  if (!users[id]) {
    users[id] = {
      id,
      name: msg.chat.username || msg.chat.first_name,
      score: 0,
      level: "🥉 Beginner",
      currentAnswer: null
    };
  }
  return users[id];
}

// ===== WEBHOOK =====
app.post('/webhook', (req, res) => {
  console.log('Webhook hit');
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ===== BOT LOGIC =====
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const text = msg.text.toLowerCase();
  const chatId = msg.chat.id;
  const user = getUser(msg);

  // START
  if (text === '/start') {
    return bot.sendMessage(chatId,
`👋 Welcome ${user.name}!

Commands:
/quiz – random quiz
/leaderboard – top users
/profile – your stats
/explain <topic> – AI teacher`
    );
  }

  // QUIZ
  if (text === '/quiz') {
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    user.currentAnswer = quiz.a;
    return bot.sendMessage(chatId, `🧠 Quiz:\n${quiz.q}`);
  }

  // ANSWER
  if (user.currentAnswer) {
    if (text === user.currentAnswer) {
      user.score += 10;
      user.level = getLevel(user.score);
      user.currentAnswer = null;
      return bot.sendMessage(chatId,
`✅ Correct!
Score: ${user.score}
Level: ${user.level}`);
    } else {
      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Explain programming simply." },
          { role: "user", content: `Explain why "${user.currentAnswer}" is correct.` }
        ]
      });

      return bot.sendMessage(chatId,
`❌ Wrong answer
🤖 AI explains:
${ai.choices[0].message.content}`);
    }
  }

  // LEADERBOARD
  if (text === '/leaderboard') {
    const sorted = Object.values(users)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (sorted.length === 0) {
      return bot.sendMessage(chatId, "No players yet.");
    }

    const board = sorted
      .map((u, i) => `${i + 1}. ${u.name} – ${u.score} pts`)
      .join('\n');

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
    if (!topic) {
      return bot.sendMessage(chatId, "Usage: /explain javascript loops");
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Teach programming simply for beginners." },
        { role: "user", content: `Explain ${topic}.` }
      ]
    });

    return bot.sendMessage(chatId, ai.choices[0].message.content);
  }
});

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.send('Bot is alive');
});

app.listen(PORT, () => {
  console.log('Server running');
});

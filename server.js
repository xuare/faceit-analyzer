import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const FACEIT_KEY = process.env.FACEIT_API_KEY;
const BASE = 'https://open.faceit.com/data/v4';
const GAME = 'cs2';

if (!FACEIT_KEY) {
  console.warn('⚠️  FACEIT_API_KEY не задан. Создайте .env на основе .env.example и впишите свой ключ.');
}

// Единая обёртка над запросами к FACEIT Data API.
// Ключ живёт только здесь, на сервере, и никогда не уходит в браузер.
async function faceitGet(pathAndQuery) {
  const res = await fetch(BASE + pathAndQuery, {
    headers: { Authorization: `Bearer ${FACEIT_KEY}` }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.errors && data.errors[0] && data.errors[0].message) ||
      `Ошибка FACEIT API: ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function handle(promiseFactory) {
  return async (req, res) => {
    try {
      const data = await promiseFactory(req);
      res.json(data);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      res.status(status).json({ error: e.message });
    }
  };
}

// Точный поиск игрока по нику (резолв в player_id + текущий уровень/эло)
app.get('/api/player/:nickname', handle((req) =>
  faceitGet(`/players?nickname=${encodeURIComponent(req.params.nickname)}&game=${GAME}`)
));

// Поиск с автодополнением — если точный ник не найден, покажем похожие варианты
app.get('/api/search', handle((req) => {
  const nickname = req.query.nickname || '';
  return faceitGet(`/search/players?nickname=${encodeURIComponent(nickname)}&game=${GAME}&offset=0&limit=10`);
}));

// Статистика игрока за всё время + разбивка по картам (segments)
app.get('/api/player-id/:id/stats', handle((req) =>
  faceitGet(`/players/${req.params.id}/stats/${GAME}`)
));

// История матчей игрока
app.get('/api/player-id/:id/history', handle((req) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  return faceitGet(`/players/${req.params.id}/history?game=${GAME}&offset=0&limit=${limit}`);
}));

// Детали матча — составы команд
app.get('/api/match/:id', handle((req) => faceitGet(`/matches/${req.params.id}`)));

// Постматчевая статистика — K/D/A и т.д. по каждому игроку
app.get('/api/match/:id/stats', handle((req) => faceitGet(`/matches/${req.params.id}/stats`)));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FACEIT Analyzer запущен: http://localhost:${PORT}`);
});

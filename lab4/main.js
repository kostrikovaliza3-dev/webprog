import fs from 'node:fs';
import http from 'node:http';
import { Command } from 'commander';

// ---------- 1. Параметри командного рядка ----------
const program = new Command();

program
  .helpOption('--help', 'показати довідку') // -h потрібен для --host
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл для запису останньої відповіді');

program.parse();
const options = program.opts();

const port = Number(options.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Некоректний порт');
  process.exit(1);
}

// ---------- 2. Допоміжні функції ----------

// Перетворює значення на число; якщо не число — повертає null
function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Надсилає відповідь клієнту
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Читає файл NDJSON (по одному JSON-об'єкту в рядку).
// Результат передається через callback(err, records)
function readData(callback) {
  fs.readFile(options.input, 'utf8', (err, text) => {
    if (err) {
      callback(new Error('Не вдалося прочитати файл даних'));
      return;
    }

    let records;
    try {
      records = text
        .split('\n')
        .filter((line) => line.trim() !== '') // пропускаємо порожні рядки
        .map((line) => JSON.parse(line));
    } catch (parseError) {
      callback(new Error('Файл даних пошкоджений'));
      return;
    }

    // кожен запис має бути об'єктом
    const allObjects = records.every(
      (r) => r !== null && typeof r === 'object' && !Array.isArray(r)
    );
    if (!allObjects) {
      callback(new Error('Файл даних пошкоджений'));
      return;
    }

    callback(null, records);
  });
}

// ---------- 3. Обробка запиту ----------
function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname !== '/') {
    sendJson(res, 404, { error: 'Маршрут не знайдено' });
    return;
  }

  readData((err, records) => {
    if (err) {
      sendJson(res, 500, { error: err.message });
      return;
    }

    const result = records.map((record) => ({
      petal_length: toNumber(record['petal.length']),
      petal_width: toNumber(record['petal.width']),
    }));

    sendJson(res, 200, result);
  });
}

// ---------- 4. Запуск сервера ----------
// спочатку перевіряємо, що файл даних існує
fs.access(options.input, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }

  const server = http.createServer(handleRequest);

  server.on('error', (serverError) => {
    console.error('Помилка сервера: ' + serverError.message);
    process.exit(1);
  });

  server.listen(port, options.host, () => {
    console.log(`Сервер запущено: http://${options.host}:${port}/`);
  });
});

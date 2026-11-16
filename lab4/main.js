import fs from 'node:fs';
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

// ---------- 2. Перевірка файлу даних ----------
fs.access(options.input, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }
  console.log('Файл даних знайдено: ' + options.input);
});

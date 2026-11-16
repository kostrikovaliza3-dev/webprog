import { readFileSync } from 'node:fs';
import { Command, Option, InvalidArgumentError } from 'commander';

const DEFAULT_FILE = 'data.json';

// Власний клас помилки: так відрізняємо «очікувані» помилки даних від збоїв у коді.
class CliError extends Error {}

// ---------- читання даних ----------
function loadData(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new CliError(`Файл не знайдено: ${filePath}`);
    if (err.code === 'EISDIR') throw new CliError(`Це тека, а не файл: ${filePath}`);
    if (err.code === 'EACCES') throw new CliError(`Немає доступу до файлу: ${filePath}`);
    throw new CliError(`Не вдалося прочитати ${filePath}: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new CliError(`Файл ${filePath} містить некоректний JSON: ${err.message}`);
  }

  if (data === null || !Array.isArray(data.teams) || !Array.isArray(data.matches)) {
    throw new CliError(`Файл ${filePath} має неочікувану структуру: потрібні масиви "teams" і "matches".`);
  }
  return data;
}

// ---------- допоміжні функції (залежать від структури JSON) ----------
const POSITIONS = { GK: 'воротар', DF: 'захисник', MF: 'півзахисник', FW: 'нападник' };

function findTeam(data, name) {
  const team = data.teams.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!team) {
    const names = data.teams.map((t) => t.name).join(', ');
    throw new CliError(`Команду не знайдено: ${name}. Доступні команди: ${names}.`);
  }
  return team;
}

// Іде по ключах через крапку. Object.hasOwn відрізняє «поля немає» від «поле дорівнює null».
function getByPath(object, fieldPath) {
  let current = object;
  for (const key of fieldPath.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return { found: false };
    }
    current = current[key];
  }
  return { found: true, value: current };
}

function printValue(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

// ---------- перевірка значень опцій ----------
function parsePositiveInt(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new InvalidArgumentError('потрібне додатне ціле число.');
  }
  return Number(value);
}

// ---------- українські повідомлення commander ----------
function translateError(message) {
  const line = message.trim().split('\n')[0];
  const rules = [
    [/^error: missing required argument '(.+)'$/, (m) => `не вказано обов'язковий аргумент '${m[1]}'`],
    [/^error: unknown option '(.+)'$/, (m) => `невідома опція '${m[1]}'`],
    [/^error: unknown command '(.+)'$/, (m) => `невідома команда '${m[1]}'`],
    [/^error: option '(.+)' argument missing$/, (m) => `для опції '${m[1]}' не вказано значення`],
    [
      /^error: too many arguments for '(.+)'\. Expected (\d+) arguments? but got (\d+)\.$/,
      (m) => `забагато аргументів для '${m[1]}': очікується ${m[2]}, отримано ${m[3]}`,
    ],
    [
      /^error: option '(.+)' argument '(.*)' is invalid\.\s*(.*)$/,
      (m) => `некоректне значення '${m[2]}' для опції '${m[1]}': ${m[3].replace('Allowed choices are', 'допустимі значення —')}`,
    ],
  ];
  for (const [regex, build] of rules) {
    const match = line.match(regex);
    if (match) return `Помилка: ${build(match)}`;
  }
  return `Помилка виклику: ${line.replace(/^error: /, '')}`;
}

const HELP_TITLES = {
  'Usage:': 'Використання:',
  'Options:': 'Опції:',
  'Commands:': 'Команди:',
  'Arguments:': 'Аргументи:',
};

// ---------- опис програми ----------
const program = new Command();

program
  .name('football')
  .description('Перегляд футбольного турніру, описаного у JSON-файлі')
  .version('1.0.0', '-v, --version', 'показати версію програми')
  .helpOption('-h, --help', 'показати довідку')
  .helpCommand('help [command]', 'показати довідку щодо команди')
  .option('-f, --file <path>', 'шлях до JSON-файлу з даними', DEFAULT_FILE)
  .showHelpAfterError('(скористайтеся --help, щоб побачити довідку)')
  .configureOutput({
    outputError: (message, write) => write(`${translateError(message)}\n`),
  })
  .configureHelp({
    styleTitle: (title) => HELP_TITLES[title] ?? title,
  });

// Опція -f оголошена на програмі, тому читаємо її тут для будь-якої команди.
const data = () => loadData(program.opts().file);

// ---------- загальні можливості ----------
program
  .command('list')
  .description('показати стислий список команд турніру')
  .option('-n, --limit <count>', 'показати не більше вказаної кількості команд', parsePositiveInt)
  .action((options) => {
    let teams = data().teams;
    if (options.limit !== undefined) teams = teams.slice(0, options.limit);
    for (const t of teams) {
      console.log(`${t.name} — ${t.city}, тренер: ${t.coach.name}, гравців: ${t.players.length}`);
    }
  });

program
  .command('show')
  .description('показати одну команду цілком')
  .argument('<team>', 'назва команди, наприклад Бескиди')
  .action((teamName) => {
    printValue(findTeam(data(), teamName));
  });

program
  .command('get')
  .description('показати значення окремого поля команди (у тому числі вкладеного)')
  .argument('<team>', 'назва команди')
  .argument('<field>', 'поле; вкладені через крапку: city, coach.name, players.0.name')
  .action((teamName, field) => {
    const team = findTeam(data(), teamName);
    const result = getByPath(team, field);
    if (!result.found) {
      throw new CliError(`Поле «${field}» відсутнє в команді «${team.name}».`);
    }
    printValue(result.value); // null — це значення, а не помилка
  });

// ---------- можливості варіанта 4 ----------
program
  .command('roster')
  .description('показати склад обраної команди')
  .argument('<team>', 'назва команди, наприклад Бескиди')
  .addOption(
    new Option('-p, --position <position>', 'показати лише гравців однієї позиції').choices(Object.keys(POSITIONS)),
  )
  .action((teamName, options) => {
    const team = findTeam(data(), teamName);
    const players = team.players.filter((p) => !options.position || p.position === options.position);
    console.log(`Склад команди ${team.name}:`);
    if (players.length === 0) {
      console.log('(немає гравців на цій позиції)');
      return;
    }
    for (const p of players) {
      const captain = p.isCaptain ? ' [капітан]' : '';
      console.log(`№${String(p.number).padEnd(2)} ${p.name}, ${p.position} (${POSITIONS[p.position]})${captain}`);
    }
  });

// Перевіряє формат РРРР-ММ-ДД і те, що така дата існує (наприклад, 2026-02-30 — ні).
function parseDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidArgumentError('потрібна дата у форматі РРРР-ММ-ДД.');
  }
  return value;
}

function formatMatch(m) {
  const result = m.score === null ? 'ще не зіграно' : `${m.score.home}:${m.score.away}`;
  return `${m.date} ${m.time} | тур ${m.round} | ${m.homeTeam} — ${m.awayTeam} | ${result}`;
}

program
  .command('matches')
  .description('показати матчі з відбором за командою та/або датою')
  .option('-t, --team <name>', 'лише матчі цієї команди (вдома або в гостях)')
  .option('-d, --date <date>', 'лише матчі цього дня (РРРР-ММ-ДД)', parseDate)
  .option('-g, --goals', 'показати також голи кожного матчу')
  .action((options) => {
    const all = data();
    const teamName = options.team ? findTeam(all, options.team).name : null;
    const found = all.matches.filter(
      (m) =>
        (!teamName || m.homeTeam === teamName || m.awayTeam === teamName) &&
        (!options.date || m.date === options.date),
    );
    if (found.length === 0) {
      console.log('Матчів за вказаними умовами не знайдено.');
      return;
    }
    for (const m of found) {
      console.log(formatMatch(m));
      if (options.goals) {
        for (const g of m.goals) {
          console.log(`    ${g.minute}' ${g.scorer} (${g.team})${g.ownGoal ? ' [автогол]' : ''}`);
        }
      }
    }
  });

program
  .command('scorers')
  .description('показати список бомбардирів за кількістю голів')
  .option('-n, --limit <count>', 'показати не більше вказаної кількості гравців', parsePositiveInt)
  .action((options) => {
    const counts = new Map();
    for (const match of data().matches) {
      for (const g of match.goals) {
        if (g.ownGoal) continue; // автоголи не зараховуються нападникові
        const key = `${g.scorer}|${g.team}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    let table = [...counts].map(([key, goals]) => {
      const [name, team] = key.split('|');
      return { name, team, goals };
    });
    table.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'uk'));
    if (options.limit !== undefined) table = table.slice(0, options.limit);
    if (table.length === 0) {
      console.log('Голів ще не забито.');
      return;
    }
    table.forEach((row, i) => console.log(`${i + 1}. ${row.name} (${row.team}) — ${row.goals}`));
  });

// ---------- запуск і єдина обробка помилок ----------
try {
  program.parse();
} catch (err) {
  const text = err instanceof CliError ? err.message : `Неочікувана помилка: ${err.message}`;
  console.error(`Помилка: ${text}`);
  process.exitCode = 1;
}

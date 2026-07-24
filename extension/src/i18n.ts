import type { ExtensionLanguage } from "./settings";

export const LANGUAGE_LABELS: Record<ExtensionLanguage, string> = {
  ru: "Русский",
  en: "English",
};

const RU_TO_EN: Record<string, string> = {
  "Настройки EloScope": "EloScope settings",
  "Открыть настройки EloScope": "Open EloScope settings",
  "Настройте интерфейс под себя — от карточек игроков до безопасных автоматизаций":
    "Tune the interface, from player cards to safe automations",
  "Закрыть": "Close",
  "Закрыть настройки": "Close settings",
  "Разделы настроек": "Settings sections",
  "Разделы": "Sections",
  "Общие": "General",
  "Данные, профиль и уровни": "Data, profile and levels",
  "Матч-комната": "Match room",
  "Игроки, команды и карты": "Players, teams and maps",
  "Автоматизации": "Automations",
  "Ready-up, veto и connect": "Ready-up, veto and connect",
  "Быстрые позиции": "Quick positions",
  "Сообщения для каждой карты": "Messages for each map",
  "Диагностика": "Diagnostics",
  "Локальный журнал действий": "Local action log",
  "Все автоматизации выключены по умолчанию и используют только однозначные видимые элементы FACEIT. EloScope — независимый продукт.":
    "All automations are off by default and only use unambiguous visible FACEIT elements. EloScope is an independent product.",
  "Отмена": "Cancel",
  "По умолчанию": "Defaults",
  "Сохранить": "Save",
  "Приложение Windows": "Windows app",
  "Язык": "Language",
  "Язык интерфейса": "Interface language",
  "Используется в настройках и оверлеях EloScope. Можно изменить в любой момент.":
    "Used in EloScope settings and overlays. You can change it at any time.",
  "Запускать вместе с Windows": "Start with Windows",
  "Добавляет EloScope в автозапуск Windows. Если трей включён, клиент стартует свернутым.":
    "Adds EloScope to Windows startup. If tray mode is enabled, the client starts minimized.",
  "Сворачивать в системный трей": "Minimize to system tray",
  "Кнопки свернуть и закрыть будут прятать окно. Полный выход доступен из меню трея.":
    "The minimize and close buttons hide the window. Full exit is available from the tray menu.",
  "Профиль и уровни": "Profile and levels",
  "Окно статистики профиля": "Profile stats window",
  "Количество последних завершённых CS2 5v5 матчей в баннере профиля":
    "Number of recent finished CS2 5v5 matches in the profile banner",
  "Статистика в профиле": "Profile statistics",
  "Встроенный баннер с обзором, боевыми показателями, картами и ролью игрока":
    "Native-flow banner with overview, combat metrics, maps and player role",
  "Расширенная шкала 1–20": "Extended 1-20 scale",
  "Уровни 11–20 заменяют штатную иконку в matchmaking, профиле и матч-комнате; официальный level остаётся в подсказке":
    "Levels 11-20 replace the native icon in matchmaking, profile and match room; the official level stays in the tooltip",
  "Превью до принятия": "Pre-accept preview",
  "Регион, map pool и доступный ELO в попапе «Матч готов» до нажатия Принять":
    "Region, map pool and available ELO in the Match ready popup before accepting",
  "Расширения матч-комнаты": "Match-room enhancements",
  "Главный переключатель карточек игроков, командной аналитики и сравнения карт":
    "Master switch for player cards, team analytics and map comparison",
  "Игроки": "Players",
  "Окно статистики игроков": "Player stats window",
  "Окно статистики": "Stats window",
  "Выборка для WR, AVG KILLS, K/D, K/R, ADR и командной формы":
    "Sample size for WR, AVG KILLS, K/D, K/R, ADR and team form",
  "Расширенная статистика": "Extended statistics",
  "Карточка MATCHES, WR, AVG KILLS, K/D, K/R и ADR под каждым игроком":
    "MATCHES, WR, AVG KILLS, K/D, K/R and ADR card under each player",
  "Батарейка формы": "Form battery",
  "Текущая игровая форма рядом с ником и подробный расчёт при наведении":
    "Current form beside the nickname with detailed calculation on hover",
  "Роли игроков": "Player roles",
  "Роль вместо аватара и пять оценок при наведении; расчёт по 20 матчам":
    "Role instead of avatar plus five hover scores; calculated from 20 matches",
  "Встречи с игроками": "Player encounters",
  "Сколько раз играли вместе или против, результаты и последние встречи в подсказке":
    "How often you played with or against them, results and recent encounters in the tooltip",
  "Серии побед и поражений": "Win and loss streaks",
  "Текущая зелёная или красная серия рядом с ником игрока":
    "Current green or red streak beside the player nickname",
  "Команды и карты": "Teams and maps",
  "Средний ELO команд": "Team average ELO",
  "AVG ELO каждого состава по краям заголовка матч-комнаты":
    "AVG ELO for each roster at the edges of the match-room header",
  "Прогноз изменения ELO": "ELO change estimate",
  "Ожидаемые +ELO / −ELO рядом с AVG ELO по предматчевой вероятности FACEIT":
    "Expected +ELO / -ELO next to AVG ELO from FACEIT pre-match probability",
  "Сводка команд": "Team summary",
  "Шансы, общая форма, FIREPOWER, AVG KILLS и K/D над составами":
    "Chance, overall form, FIREPOWER, AVG KILLS and K/D above rosters",
  "Сравнение карт": "Map comparison",
  "Винрейт обеих команд по каждой карте под кнопкой подключения":
    "Both teams' win rate on each map under the connect button",
  "Победы на выбранной карте": "Selected-map wins",
  "Суммарное количество побед всех пяти игроков каждой команды в карточке карты":
    "Total wins from all five players of each team in the map card",
  "Окно WR по картам": "Map WR window",
  "Количество последних матчей каждого игрока для расчёта сравнения карт":
    "Number of recent matches per player used for map comparison",
  "Включайте только нужные действия. При несовместимой или неоднозначной разметке EloScope ничего не нажимает.":
    "Enable only the actions you need. With incompatible or ambiguous markup, EloScope clicks nothing.",
  "Принимать party invites": "Accept party invites",
  "Только однозначная видимая кнопка": "Only an unambiguous visible button",
  "Подтверждает готовность в текущей комнате": "Confirms ready state in the current room",
  "Подключаться к серверу": "Connect to server",
  "Только видимая steam://connect ссылка": "Only a visible steam://connect link",
  "Копировать connect": "Copy connect",
  "Нажимает видимую кнопку FACEIT": "Clicks the visible FACEIT button",
  "Veto карт": "Map veto",
  "Проверяет ход капитана и фазу ban/pick": "Checks captain turn and ban/pick phase",
  "Veto серверов": "Server veto",
  "Выбирает первое доступное расположение": "Chooses the first available location",
  "Порядок ban карт": "Map ban order",
  "Порядок pick карт": "Map pick order",
  "Порядок серверов": "Server order",
  "Панель быстрых позиций": "Quick positions panel",
  "Показывать закреплённую панель сообщений в матч-комнате независимо от статистических карточек":
    "Shows a pinned message panel in the match room independently of stats cards",
  "По умолчанию требуется подтверждение. Auto отправляет одно сообщение только для выбранной карты и матча.":
    "Confirmation is required by default. Auto sends one message only for the selected map and match.",
  "Карты появятся из текущего map pool. Их также можно добавить вручную.":
    "Maps appear from the current map pool. You can also add them manually.",
  "Добавить карту, например train": "Add a map, for example train",
  "Добавить карту для быстрых позиций": "Add a map for quick positions",
  "Добавить": "Add",
  "Введите корректное название карты": "Enter a valid map name",
  "Удалить": "Remove",
  "Режим отправки": "Send mode",
  "Подтверждение": "Confirmation",
  "Заполнить чат": "Fill chat",
  "Включён всегда. Лог хранится локально до 7 дней, автоматически очищается и обезличивается: чувствительные значения и токены удаляются.":
    "Always enabled. The log is stored locally for up to 7 days, cleaned automatically and redacted: sensitive values and tokens are removed.",
  "Загружаю сводку…": "Loading summary...",
  "Копировать лог": "Copy log",
  "Сохранить файл": "Save file",
  "Очистить": "Clear",
  "Копирую журнал…": "Copying log...",
  "Не удалось скопировать журнал": "Could not copy log",
  "Сохраняю журнал…": "Saving log...",
  "Не удалось сохранить журнал": "Could not save log",
  "Файл диагностики сохранён": "Diagnostics file saved",
  "Сохранение файла недоступно — журнал скопирован": "File save unavailable - log copied",
  "Очищаю журнал…": "Clearing log...",
  "Не удалось очистить журнал": "Could not clear log",
  "Событий пока нет": "No events yet",
  "Журнал очищен": "Log cleared",
  "Не удалось загрузить сводку журнала": "Could not load log summary",
  "Через запятую, первое доступное значение": "Comma-separated; first available value wins",
  "Сохраняю…": "Saving...",
  "Сохранено": "Saved",
  "Не удалось сохранить настройки": "Could not save settings",
  "Карта ещё не выбрана": "Map is not selected yet",
  "По кнопке": "Manual button",
  "Авто после выбора": "Auto after pick",
  "Подготовить": "Prepare",
  "Отправить": "Send",
  "Отправка доступна после выбора этой карты": "Sending is available after this map is selected",
  "Сначала включите сообщение для карты": "Enable the message for this map first",
  "Отправлено": "Sent",
  "Текст подготовлен — чат ждёт ручную отправку": "Text prepared - chat is waiting for manual send",
  "Уже отправлено в этом матче": "Already sent in this match",
  "Чат пока не готов": "Chat is not ready yet",
  "Введите текст": "Enter text",
  "До принятия": "Before accept",
  "Регион / серверы": "Region / servers",
  "ELO скрыт": "ELO hidden",
  "ELO команд": "Team ELO",
  "Данные перехвачены из ответа FACEIT до принятия матча. Состав может быть неполным.":
    "Data was captured from FACEIT's response before match accept. Rosters may be incomplete.",
};

export function tr(language: ExtensionLanguage, ru: string, en?: string): string {
  if (language === "ru") return ru;
  return en ?? RU_TO_EN[ru] ?? ru;
}

export function matchesText(language: ExtensionLanguage, count: number): string {
  return language === "en" ? `${count} matches` : `${count} матчей`;
}

function translateDynamic(language: ExtensionLanguage, value: string): string {
  if (language === "ru") return value;
  const selected = /^Выбрана (.+)$/u.exec(value);
  if (selected) return `Selected ${selected[1]}`;
  const enablePosition = /^Включить быстрые позиции для (.+)$/u.exec(value);
  if (enablePosition) return `Enable quick positions for ${enablePosition[1]}`;
  const removeMap = /^Удалить настройки карты (.+)$/u.exec(value);
  if (removeMap) return `Remove settings for map ${removeMap[1]}`;
  const mapMessage = /^Сообщение для карты (.+)$/u.exec(value);
  if (mapMessage) return `Message for map ${mapMessage[1]}`;
  const events = /^(\d+) событий$/u.exec(value);
  if (events) return `${events[1]} events`;
  const copiedEvents = /^Скопировано событий: (\d+)$/u.exec(value);
  if (copiedEvents) return `Copied events: ${copiedEvents[1]}`;
  const matchOption = /^(\d+) матчей$/u.exec(value);
  if (matchOption) return `${matchOption[1]} matches`;
  return RU_TO_EN[value] ?? value;
}

export function localizeTree(root: ParentNode, language: ExtensionLanguage): void {
  if (language === "ru") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.nodeValue ?? "";
    const trimmed = text.trim();
    if (!trimmed) continue;
    const translated = translateDynamic(language, trimmed);
    if (translated !== trimmed) node.nodeValue = text.replace(trimmed, translated);
  }
  const elements = root instanceof Element
    ? [root, ...root.querySelectorAll<HTMLElement>("*")]
    : [...root.querySelectorAll<HTMLElement>("*")];
  for (const element of elements) {
    for (const attribute of ["title", "aria-label", "placeholder"]) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      element.setAttribute(attribute, translateDynamic(language, current));
    }
  }
}

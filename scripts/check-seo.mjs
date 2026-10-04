#!/usr/bin/env node
/**
 * zhdanov.pw, task #17: сторож SEO-разметки и настоящих 404.
 * Запуск: node scripts/check-seo.mjs   (код возврата 1 при любой ошибке)
 *
 * Страницы: / (index.html) и /ru/ (ru/index.html).
 * 1. У обеих страниц есть canonical, полный набор hreflang (en/ru/x-default)
 *    и og:image с размерами; canonical указывает на свой адрес.
 * 2. В /ru/ не осталось английских строк исходной страницы: русская версия
 *    собрана статически, а не подменяется скриптом в браузере.
 * 3. sitemap.xml перечисляет ровно обе страницы, robots.txt ссылается на него.
 * 4. Живая проверка (scripts/check-server.sh): настоящий nginx отдаёт 404 на
 *    несуществующий адрес, 301 со старого /?lang=ru на /ru/ и 200 на обе
 *    страницы. Прежний откат на главную отдавал 200 — «мягкая 404».
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://zhdanov.pw';
const PAGES = [
  ['index.html', '/', 'en'],
  ['ru/index.html', '/ru/', 'ru'],
];

const errors = [];
const bad = (m) => errors.push(m);
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
const attr = (h, re) => (h.match(re) || [])[1];

/** Английские строки исходной страницы: то, что было в разметке до сборки. */
function englishStrings(src) {
  const TAG = /<([a-zA-Z][\w-]*)((?:\s[^>]*?)?)\sdata-i18n(?:-html)?="([^"]+)"((?:\s[^>]*?)?)>([\s\S]*?)<\/\1>/g;
  return [...src.matchAll(TAG)].map((m) => ({ key: m[3], text: m[5] }));
}

const src = readFileSync(join(ROOT, 'index.html'), 'utf8');
const dict = JSON.parse(readFileSync(join(ROOT, 'i18n', 'ru.json'), 'utf8'));
const enStrings = englishStrings(src);
if (!enStrings.length) bad('в index.html не нашлось ни одного data-i18n — переводы перестали собираться, страница /ru/ устареет');

const pageHtml = {};
for (const [file, path, lang] of PAGES) {
  const tag = `${path}:`;
  if (!existsSync(join(ROOT, file))) { bad(`${tag} файла ${file} нет`); continue; }
  const h = readFileSync(join(ROOT, file), 'utf8');
  pageHtml[path] = h;

  if (!new RegExp(`<html lang="${lang}">`).test(h)) bad(`${tag} нет <html lang="${lang}">`);

  // --- canonical ---
  const canon = attr(h, /<link rel="canonical" href="([^"]*)"/);
  if (!canon) bad(`${tag} нет canonical — поисковик не знает, какая страница основная`);
  else if (unesc(canon) !== BASE + path) bad(`${tag} canonical ${canon}, ждали ${BASE + path}`);

  // --- hreflang: en, ru и x-default, все три взаимные и точные ---
  for (const hl of ['en', 'ru', 'x-default']) {
    const v = attr(h, new RegExp(`<link rel="alternate" hreflang="${hl}" href="([^"]*)"`));
    if (!v) bad(`${tag} нет hreflang="${hl}"`);
    else {
      const want = hl === 'ru' ? `${BASE}/ru/` : `${BASE}/`;
      if (unesc(v) !== want) bad(`${tag} hreflang="${hl}" = ${v}, ждали ${want}`);
    }
  }

  // --- og:image и его размеры ---
  const og = attr(h, /<meta property="og:image" content="([^"]*)"/);
  if (!og) bad(`${tag} нет og:image — ссылка в мессенджерах придёт без картинки`);
  else {
    if (!/^https:\/\/zhdanov\.pw\//.test(unesc(og))) bad(`${tag} og:image ${og} — нужен абсолютный адрес на этом домене`);
    const w = attr(h, /<meta property="og:image:width" content="([^"]*)"/);
    const hh = attr(h, /<meta property="og:image:height" content="([^"]*)"/);
    if (w !== '1200' || hh !== '630') bad(`${tag} og:image ${w}×${hh}, ждали 1200×630`);
    if (!/<meta name="twitter:image" content="[^"]*"/.test(h)) bad(`${tag} нет twitter:image`);
  }
}

// --- русская страница: свой текст, без английских остатков ---
const ru = pageHtml['/ru/'] || '';
if (ru) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  // Проверяем видимую часть разметки. Вырезаем ТОЛЬКО блок JSON-LD: там
  // список навыков латиницей («System architecture», «Multi-tenant SaaS»),
  // он намеренно английский. Все script подряд вырезать нельзя: на странице
  // их три открывающих и два закрывающих тега, и нежадная регулярка съедала
  // 49 КБ из 65 — вместе с разделом «О себе», ради которого проверка и нужна.
  const body = ru.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  for (const { key, text } of enStrings) {
    const en = norm(text);
    if (en.length < 12) continue;                      // короткие слова совпадают везде
    if (dict.strings[key] != null && norm(dict.strings[key]) === en) continue; // перевод совпал — не остаток
    if (body.includes(en)) bad(`/ru/: осталась английская строка «${en.slice(0, 48)}…» (ключ ${key}) — русский текст не в разметке`);
  }
  // Сильная сторона той же проверки: каждое значение словаря обязано попасть
  // в разметку. Если сборщик пропустил ключ, английский текст останется здесь.
  for (const [key, value] of Object.entries(dict.strings)) {
    if (!ru.includes(value)) bad(`/ru/: перевод «${key}» не попал в разметку — на странице останется английский текст`);
  }
  const enTitle = attr(pageHtml['/'] || '', /<title>([^<]*)<\/title>/);
  const ruTitle = attr(ru, /<title>([^<]*)<\/title>/);
  if (ruTitle === enTitle) bad('/ru/: title совпадает с английской страницей — у русской версии должно быть своё');
  if (!/[а-яёА-ЯЁ]/.test(ruTitle || '')) bad(`/ru/: title без кириллицы: «${ruTitle}»`);
  const ruDesc = attr(ru, /<meta name="description" content="([^"]*)"/);
  if (!/[а-яёА-ЯЁ]/.test(unesc(ruDesc || ''))) bad('/ru/: description без кириллицы — значит это английский текст');
  const enDesc = attr(pageHtml['/'] || '', /<meta name="description" content="([^"]*)"/);
  if (ruDesc === enDesc) bad('/ru/: description совпадает с английской страницей');
  if (ru.includes('?lang=ru')) bad('/ru/: осталась ссылка на ?lang=ru — этот адрес закрывает 301, он не должен жить в разметке');
}

// --- sitemap.xml и robots.txt ---
if (!existsSync(join(ROOT, 'sitemap.xml'))) bad('нет sitemap.xml');
else {
  const sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const want = PAGES.map(([, p]) => BASE + p).sort();
  if (JSON.stringify(locs) !== JSON.stringify(want)) bad(`sitemap.xml: адреса ${locs.join(', ')} — ждали ${want.join(', ')}`);
  for (const p of PAGES.map(([, p]) => p)) {
    const entry = (sm.split('<url>')[1 + PAGES.findIndex(([, q]) => q === p)] || '').split('</url>')[0] || '';
    for (const hl of ['en', 'ru', 'x-default']) {
      if (!new RegExp(`<xhtml:link rel="alternate" hreflang="${hl}"`).test(entry)) {
        bad(`sitemap.xml: у ${p} нет xhtml:link hreflang="${hl}" — версии не связаны между собой`);
      }
    }
  }
  if (!/xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(sm)) bad('sitemap.xml: нет объявления xmlns:xhtml — ссылки между языками не будут понятны');
}
if (!existsSync(join(ROOT, 'robots.txt'))) bad('нет robots.txt');
else {
  const rb = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  if (!rb.includes(`Sitemap: ${BASE}/sitemap.xml`)) bad('robots.txt: нет строки Sitemap');
  if (/^Disallow:\s*\/\s*$/m.test(rb)) bad('robots.txt: закрыт весь сайт — русская версия в выдачу не попадёт');
}

// --- файл подтверждения Google ---
// Владелец прислал его, @Clause положил на бою руками. Живая проверка ниже
// смотрит корень репозитория и такой случай не поймает: файл в репозитории
// есть, а в образ при пересборке не попадёт, если его нет в COPY. Поэтому
// проверяем Dockerfile отдельно.
const VERIFY = 'googlef135278a92d1749a.html';
const TOKEN = `google-site-verification: ${VERIFY}`;
if (!existsSync(join(ROOT, VERIFY))) {
  bad(`нет ${VERIFY} — пересборка контейнера снесёт подтверждение в Search Console`);
} else {
  const got = readFileSync(join(ROOT, VERIFY), 'utf8');
  if (got.trim() !== TOKEN) bad(`${VERIFY}: содержимое «${got.trim().slice(0, 60)}», а нужен токен Google`);
}
if (existsSync(join(ROOT, 'Dockerfile'))) {
  const df = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
  if (!df.includes(VERIFY)) bad(`Dockerfile не копирует ${VERIFY} — в образе подтверждения не будет`);
} else {
  bad('нет Dockerfile');
}
if (existsSync(join(ROOT, 'sitemap.xml'))) {
  if (readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').includes(VERIFY)) bad('файл подтверждения попал в sitemap.xml');
}

// --- живая проверка nginx: 404, 301 и 200 ---
let live = 'пропущена (нет nginx или curl)';
if (existsSync('/usr/sbin/nginx') || existsSync('/usr/local/sbin/nginx')) {
  try {
    live = execFileSync('bash', [join(ROOT, 'scripts', 'check-server.sh')], { encoding: 'utf8' }).trim().split('\n').pop();
  } catch (e) {
    bad('живая проверка nginx провалилась:\n' + String(e.stdout || e.message).trim());
  }
}

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }
console.log(`OK: ${PAGES.length} страницы — canonical, hreflang, og:image; русский текст в разметке; sitemap и robots; nginx: ${live}`);

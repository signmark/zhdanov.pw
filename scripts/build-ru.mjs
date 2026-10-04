#!/usr/bin/env node
/**
 * Craft Podium / task #17: собирает статическую русскую версию сайта.
 *
 * Запуск: node scripts/build-ru.mjs   (код возврата 1 при любой ошибке)
 *
 * Источники: index.html (английская разметка, атрибуты data-i18n) и
 * i18n/ru.json (словарь русского текста). На выходе ru/index.html, где
 * русский текст уже в разметке: поисковик видит его без выполнения скриптов,
 * поэтому канонический адрес русской версии — https://zhdanov.pw/ru/.
 *
 * Скрипт ничего не придумывает: каждый перевод берётся из словаря, и если
 * ключа нет — сборка падает, а не оставляет английскую строку.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://zhdanov.pw';
const EN = { url: `${BASE}/`, lang: 'en' };
const RU = { url: `${BASE}/ru/`, lang: 'ru' };

const errors = [];
const bad = (m) => errors.push(m);

const src = readFileSync(join(ROOT, 'index.html'), 'utf8');
const dict = JSON.parse(readFileSync(join(ROOT, 'i18n', 'ru.json'), 'utf8'));
const meta = dict.meta.ru;

// --- 1. русский текст в разметку --------------------------------------
// <tag ... data-i18n(-html)="key" ...>…</tag> — заменяем только содержимое.
const TAG = /<([a-zA-Z][\w-]*)((?:\s[^>]*?)?)\sdata-i18n(?:-html)?="([^"]+)"((?:\s[^>]*?)?)>([\s\S]*?)<\/\1>/g;
let out = src.replace(TAG, (_all, tag, before, key, after, inner) => {
  const value = dict.strings[key];
  if (value == null) {
    bad(`в i18n/ru.json нет ключа «${key}» (элемент <${tag}>) — на /ru/ останется английский текст`);
    return _all;
  }
  if (/\S/.test(value) === false && /\S/.test(inner)) {
    bad(`ключ «${key}» пустой, а в разметке есть текст «${inner.slice(0, 30)}…»`);
  }
  return `<${tag}${before}${after}>${value}</${tag}>`;
});

// незакрытые или вложенные в одноимённый тег элементы регулярка не возьмёт
const attrs = [...src.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]);
const replaced = [...src.matchAll(TAG)].map((m) => m[3]);
if (replaced.length !== attrs.length) bad(`разметка изменилась: атрибутов data-i18n ${attrs.length}, заменено ${replaced.length}`);

// --- 2. атрибуты-метки больше не нужны: русский текст статичен ---------
out = out.replace(/\sdata-i18n(?:-html)?="[^"]*"/g, '');

// --- 3. язык, канонический адрес, hreflang -------------------------------
out = out.replace('<html lang="en">', '<html lang="ru">');
out = out.replace(`<link rel="canonical" href="${EN.url}" />`, `<link rel="canonical" href="${RU.url}" />`);
out = out.replace(
  `<link rel="alternate" hreflang="en" href="${EN.url}" />`,
  `<link rel="alternate" hreflang="en" href="${EN.url}" />`);
out = out.replace(
  `<link rel="alternate" hreflang="ru" href="${RU.url}" />`,
  `<link rel="alternate" hreflang="ru" href="${RU.url}" />`);
out = out.replace(
  `<link rel="alternate" hreflang="x-default" href="${EN.url}" />`,
  `<link rel="alternate" hreflang="x-default" href="${EN.url}" />`);

// --- 4. свои title, description и og/twitter на русском -----------------
const swap = (re, value, what) => {
  if (!re.test(out)) bad(`${what}: не нашлось, чем заменить`);
  out = out.replace(re, value);
};
swap(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`, 'title');
swap(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${meta.desc}" />`, 'description');
swap(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${RU.url}" />`, 'og:url');
swap(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${meta.title}" />`, 'og:title');
swap(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${meta.ogDesc}" />`, 'og:description');
swap(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${meta.title}" />`, 'twitter:title');
swap(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${meta.twDesc}" />`, 'twitter:description');
swap(/<meta property="og:locale" content="[^"]*" \/>/, `<meta property="og:locale" content="ru_RU" />`, 'og:locale');
swap(/<meta property="og:locale:alternate" content="[^"]*" \/>/, `<meta property="og:locale:alternate" content="en_US" />`, 'og:locale:alternate');

// --- 5. переключатель языка: текущая страница помечена, другая — ссылка --
out = out.replace(
  `<a class="lang-btn" href="/" aria-current="page">EN</a>`,
  `<a class="lang-btn" href="/" hreflang="en" lang="en">EN</a>`);
out = out.replace(
  `<a class="lang-btn" href="/ru/" hreflang="ru" lang="ru">RU</a>`,
  `<a class="lang-btn" href="/ru/" hreflang="ru" lang="ru" aria-current="page">RU</a>`);

// --- 6. страница не должна остаться клиентским переключателем ----------
if (/\?lang=ru/.test(out)) bad('на /ru/ осталась ссылка на ?lang=ru — это старый адрес, его закрывает 301');
if (out.includes('var RU = {')) bad('на /ru/ остался словарь RU — статической странице он не нужен');

if (errors.length) { console.error(errors.map((e) => 'FAIL ' + e).join('\n')); process.exit(1); }

mkdirSync(join(ROOT, 'ru'), { recursive: true });
writeFileSync(join(ROOT, 'ru', 'index.html'), out);
const cyr = (out.match(/[а-яёА-ЯЁ]/g) || []).length;
console.log(`OK: ru/index.html собран — ${out.length} байт, переведено строк ${replaced.length}, кириллических символов ${cyr}`);

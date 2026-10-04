#!/usr/bin/env bash
# zhdanov.pw, task #17: живая проверка nginx.conf.
#
# Поднимает настоящий nginx на 8080 с корнем из репозитория и проверяет
# то, что нельзя увидеть в исходниках: какой код и какая страница реально
# приходят по адресам. Главное здесь — настоящий 404 на несуществующий адрес
# вместо прежнего отката на главную.
#
# Отличия от боевого конфига (только ради локального прогона):
#   listen 80 -> 8080 (без root порт <1024 не занять),
#   root /usr/share/nginx/html -> корень репозитория.
# Все проверяемые директивы — как в бою.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP=/tmp/ngx-t17
CONF=$TMP/conf.d/default.conf
fail=0
ok()   { printf '  %-44s %s\n' "$1" "OK"; }
no()   { printf '  %-44s FAIL %s\n' "$1" "$2"; fail=1; }
expect() { # описание, ожидание, фактическое
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "ждали «$2», получили «$3»"; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Порт для проверки задаётся здесь и подставляется дальше в sed, в B и в
# проверку занятости. Держать его в трёх местах нельзя: поменяли один, а
# проверка продолжила мерить чужой сервер — ровно тот случай, ради которого
# написан блок занятости ниже.
PORT=8080

rm -rf "$TMP"; mkdir -p "$TMP/conf.d" "$TMP/logs" "$TMP/body" "$TMP/proxy" \
  "$TMP/fastcgi" "$TMP/uwsgi" "$TMP/scgi"
sed -e "s/listen 80;/listen $PORT;/" \
    -e "s/listen \[::\]:80;/listen [::]:$PORT;/" \
    -e "s#root /usr/share/nginx/html;#root $ROOT;#" \
    "$ROOT/nginx.conf" > "$CONF"

cat > "$TMP/nginx.conf" <<EOF
worker_processes 1;
error_log $TMP/logs/error.log;
pid $TMP/nginx.pid;
events { worker_connections 64; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log $TMP/logs/access.log;
  client_body_temp_path $TMP/body;
  proxy_temp_path $TMP/proxy;
  fastcgi_temp_path $TMP/fastcgi;
  uwsgi_temp_path $TMP/uwsgi;
  scgi_temp_path $TMP/scgi;
  include $TMP/conf.d/*.conf;
}
EOF

out=$(nginx -t -c "$TMP/nginx.conf" 2>&1)
case "$out" in
  *"syntax is ok"*) ok "nginx -t: синтаксис" ;;
  *) no "nginx -t: синтаксис" "$out"; echo "$out"; exit 1 ;;
esac
case "$out" in
  *warn*) no "nginx -t: без предупреждений" "есть warn" ;;
  *) ok "nginx -t: без предупреждений" ;;
esac

# Порт занят — это не «проверка провалилась», а проверка не проверяла ничего.
# nginx не может занять порт, падает с [emerg] bind(), а все curl ниже уходят
# на чужой процесс: тот отвечает 200 на / и 404 на всё остальное, и проверка
# выдаёт девять правдоподобных, но ложных провалов на целом сайте. Именно так
# выглядела неудача на 8080, пока там висел nginx от проверки t16.
B=http://127.0.0.1:$PORT
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "ПОРТ $PORT ЗАНЯТ — проверка не запущена."
  echo "Кто слушает:"
  ss -ltnp 2>/dev/null | grep ":$PORT " || true
  echo "Освободите порт (например, погасите оставшийся nginx) и запустите снова."
  exit 1
fi

nginx -c "$TMP/nginx.conf" 2>/dev/null
# nginx -t проверяет конфиг, а не то, поднялся ли процесс: признак here —
# pid-файл. Страховка на случай, когда порт заняли между проверкой и стартом.
sleep 1
if [ ! -f "$TMP/nginx.pid" ]; then
  echo "nginx не поднялся (порт $PORT занят?) — проверка не запущена."
  tail -n 3 "$TMP/logs/error.log" 2>/dev/null || true
  exit 1
fi
trap 'nginx -c "$TMP/nginx.conf" -s quit 2>/dev/null' EXIT
sleep 1

# --- то, ради чего всё затевалось ---
expect "несуществующий адрес -> 404" "404" "$(code "$B/nope-does-not-exist")"
body=$(curl -s "$B/nope-does-not-exist")
case "$body" in
  *"Такой страницы нет"*) ok "404 отдаёт страницу 404.html" ;;
  *) no "404 отдаёт страницу 404.html" "пришёл: $(printf '%s' "$body" | head -c 60)" ;;
esac
case "$body" in
  *"Dmitry Zhdanov"*) no "404 не подменяется главной" "в ответе главная страница" ;;
  *) ok "404 не подменяется главной" ;;
esac
expect "глубокий несуществующий адрес -> 404" "404" "$(code "$B/ru/also-not-here")"
expect "служебный 404.html напрямую -> 404" "404" "$(code "$B/404.html")"

# --- страницы и редирект ---
expect "/ -> 200" "200" "$(code "$B/")"
expect "/ru/ -> 200" "200" "$(code "$B/ru/")"
expect "старый /?lang=ru -> 301" "301" "$(code "$B/?lang=ru")"
loc=$(curl -s -o /dev/null -D - "$B/?lang=ru" | tr -d '\r' | awk -F': ' 'tolower($1)=="location"{print $2}')
# task #23: с absolute_redirect off Location — это путь, а не абсолютный
# адрес. Раньше проверка принимала «http://имя/ru/», и за прокси с https
# браузер уходил на http: сайт без шифрования на один переход.
case "${loc:-}" in
  /ru/) ok "редирект ведёт на /ru/ путём, а не абсолютным адресом" ;;
  http://*|https://*) no "редирект ведёт на /ru/ путём" "Location абсолютный: ${loc} — верни absolute_redirect off" ;;
  *) no "редирект ведёт на /ru/ путём" "Location: ${loc:-нет}" ;;
esac
# и сам конфиг: без директивы проверка выше не могла бы стать зелёной
if grep -q '^\s*absolute_redirect off;' "$ROOT/nginx.conf"; then
  ok "в nginx.conf есть absolute_redirect off"
else
  no "в nginx.conf есть absolute_redirect off" "директивы нет — Location снова станет абсолютным"
fi
# CSS с меткой версии: без метки правка стилей не дойдёт 30 дней
v=$(curl -s -o /dev/null -D - "$B/assets/site.css?v=test" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')
case "$v" in
  *max-age=2592000*) ok "CSS всё ещё кэшируется на 30 дней — метка версии обязательна" ;;
  *) no "CSS кэшируется на 30 дней" "Cache-Control: ${v:-нет}" ;;
esac
expect "русская страница отдаётся на русском" "Дмитрий Жданов" \
  "$(curl -s "$B/ru/" | grep -o 'Дмитрий Жданов' | head -1)"
expect "русская страница: canonical на /ru/" "https://zhdanov.pw/ru/" \
  "$(curl -s "$B/ru/" | grep -o '<link rel="canonical" href="[^"]*"' | sed 's/.*href="//;s/"//')"
expect "CSS отдаётся и сжат" "200" "$(code "$B/assets/site.css")"
want=$(sha256sum "$ROOT/assets/site.css" | cut -c1-8)
for f in index.html ru/index.html; do
  got=$(grep -o 'href="/assets/site.css?v=[0-9a-f]*"' "$ROOT/$f" | head -1 | sed 's/.*v=//;s/"$//')
  if [ "$got" = "$want" ]; then ok "метка CSS в $f совпадает с файлом ($want)"; else no "метка CSS в $f" "метка ${got:-нет}, файл даёт $want"; fi
done
# старая метка после правки CSS обязана переставать совпадать: иначе браузер
# месяц показывает прежние стили
sed -i '1i /* t23 */' "$ROOT/assets/site.css"
stale=$(grep -o 'href="/assets/site.css?v=[0-9a-f]*"' "$ROOT/index.html" | sed 's/.*v=//;s/"$//')
sed -i '1d' "$ROOT/assets/site.css"
if [ "$stale" = "$want" ]; then ok "правка CSS меняет метку (иначе кэш месяц)"; else no "правка CSS меняет метку" "метка не поменялась: $stale"; fi
enc=$(curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' "$B/assets/site.css" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-encoding"{print $2}')
expect "CSS жмётся gzip" "gzip" "${enc:-нет}"
expect "og:image отдаётся" "200" "$(code "$B/assets/og.png")"
expect "robots.txt -> 200" "200" "$(code "$B/robots.txt")"
expect "sitemap.xml -> 200" "200" "$(code "$B/sitemap.xml")"

# --- файл подтверждения Google (владелец прислал, на бою положил руками) ---
# Без него в репозитории пересборка контейнера его бы удалила, и подтверждение
# в Search Console слетело бы.
expect "файл подтверждения Google -> 200" "200" "$(code "$B/googlef135278a92d1749a.html")"
expect "токен в файле подтверждения" "google-site-verification: googlef135278a92d1749a.html" \
  "$(curl -s "$B/googlef135278a92d1749a.html")"
case "$(curl -s "$B/sitemap.xml")" in
  *googlef135278a92d1749a*) no "файла подтверждения нет в sitemap" "он попал в карту" ;;
  *) ok "файла подтверждения нет в sitemap" ;;
esac

echo
[ $fail -eq 0 ] && echo "ИТОГ: nginx отдаёт настоящий 404, обе версии и редирект на месте" \
                || { echo "ИТОГ: есть провалы"; exit 1; }

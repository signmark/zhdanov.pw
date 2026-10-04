FROM nginx:alpine

# Копируем наш кастомный конфиг Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем файлы сайта. До task #17 тут был только index.html, но теперь
# есть ещё русская версия /ru/, собранный CSS, robots.txt, sitemap.xml
# и страница 404 — без них контейнер поднимется, а сайт будет битый.
COPY index.html 404.html robots.txt sitemap.xml googlef135278a92d1749a.html /usr/share/nginx/html/
COPY ru/ /usr/share/nginx/html/ru/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

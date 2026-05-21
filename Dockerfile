FROM caddy:2-alpine

# Конфиг Caddy
COPY Caddyfile /etc/caddy/Caddyfile

# Статика сайта
COPY index.html /srv/index.html

EXPOSE 80
EXPOSE 443

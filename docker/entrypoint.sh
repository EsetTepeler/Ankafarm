#!/bin/sh
# nginx imajı /docker-entrypoint.d/ altındaki betikleri açılışta çalıştırır.
# API adresini derleme anında değil çalışma anında yazarız; aynı imaj her ortamda çalışır.
set -e
: "${API_URL:?API_URL ortam değişkeni gerekli (örn. https://api.ciftlik.example)}"
API_URL_TRIMMED="${API_URL%/}"
printf '{ "apiUrl": "%s" }\n' "$API_URL_TRIMMED" > /usr/share/nginx/html/config.json
echo "config.json yazıldı: apiUrl=$API_URL_TRIMMED"

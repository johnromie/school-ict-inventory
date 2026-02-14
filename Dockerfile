FROM php:8.2-cli

RUN docker-php-ext-install pdo pdo_sqlite

WORKDIR /opt/render/project/src

COPY . /opt/render/project/src

ENV PORT=10000

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} -t /opt/render/project/src"]

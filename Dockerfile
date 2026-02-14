FROM php:8.2-cli

RUN apt-get update \
  && apt-get install -y --no-install-recommends libsqlite3-dev \
  && docker-php-ext-install pdo pdo_sqlite \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/render/project/src

COPY . /opt/render/project/src

ENV PORT=10000

CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} -t /opt/render/project/src"]

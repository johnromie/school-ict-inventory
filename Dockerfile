FROM node:20-bookworm-slim

WORKDIR /opt/render/project/src

COPY package.json /opt/render/project/src/package.json

RUN npm install --omit=dev

COPY . /opt/render/project/src

ENV PORT=10000

CMD ["node", "server.js"]

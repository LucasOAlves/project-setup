FROM node:22-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json

RUN npm install

COPY packages ./packages
COPY apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]

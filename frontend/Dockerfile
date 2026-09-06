# Build stage
FROM node:24-alpine AS build

WORKDIR /app

RUN apk upgrade --no-cache

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


# Production stage
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk upgrade --no-cache

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node

EXPOSE 8080

CMD ["node", "dist-server/server/index.js"]
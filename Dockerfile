# Build stage
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# Production stage
FROM nginx:alpine

RUN apk add --no-cache gettext

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/nginx.conf

RUN mkdir -p \
    /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /var/run/nginx \
    && chown -R nginx:nginx \
    /var/cache/nginx \
    /var/run/nginx

COPY --from=build --chown=nginx:nginx \
    /app/dist /usr/share/nginx/html

RUN cp /usr/share/nginx/html/config.template.js /tmp/config.template.js \
    && chown nginx:nginx /tmp/config.template.js \
    && chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080

CMD ["sh", "-c", "envsubst '${POD_NAME} ${POD_NAMESPACE} ${NODE_NAME} ${POD_IP} ${APP_NAME}' < /tmp/config.template.js > /usr/share/nginx/html/config.js && nginx -g 'daemon off;'"]
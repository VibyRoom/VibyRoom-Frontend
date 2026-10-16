# Stage 1: build React/Vite application
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build


# Stage 2: serve static files with Nginx
FROM nginx:stable-alpine AS runtime

COPY --from=build /app/dist/ /usr/share/nginx/html/

COPY deploy/nginx/default.conf.template \
    /etc/nginx/templates/default.conf.template

ENV NGINX_ENVSUBST_FILTER="^BACKEND_UPSTREAM$"

EXPOSE 8080

HEALTHCHECK --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD wget -q -O /dev/null \
        http://127.0.0.1:8080/healthz \
        || exit 1

CMD ["nginx", "-g", "daemon off;"]
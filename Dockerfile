# syntax=docker/dockerfile:1
FROM node:24-alpine AS web-build

WORKDIR /app
COPY package.json ./
COPY web/package*.json ./web/
RUN npm ci --prefix web --no-fund --no-audit
COPY web ./web
RUN mkdir -p server/public && npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/wstimin/KMGLXT"
LABEL org.opencontainers.image.description="十夜卡密综合性卡密管理系统"
RUN apk add --no-cache su-exec
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev --no-fund --no-audit
COPY server ./server
COPY package.json ./
COPY --from=web-build /app/server/public ./server/public
COPY deploy/docker/entrypoint.sh /usr/local/bin/kmglxt-entrypoint

ARG APP_VERSION=source
RUN printf '%s\n' "$APP_VERSION" > /app/.km-version \
    && chmod +x /usr/local/bin/kmglxt-entrypoint \
    && mkdir -p /data \
    && chown -R node:node /data /app

ENV NODE_ENV=production \
    PORT=1111 \
    DATA_DIR=/data \
    DEPLOY_MODE=docker

VOLUME ["/data"]
EXPOSE 1111
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:1111/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["kmglxt-entrypoint"]

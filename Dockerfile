FROM node:24-bookworm-slim AS web
WORKDIR /build
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./web
RUN pnpm build

FROM python:3.12-slim AS app
WORKDIR /app
COPY requirements.lock pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.lock
COPY evidencedesk ./evidencedesk
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY --from=web /build/web/dist ./web/dist
RUN pip install --no-deps . && useradd --create-home --uid 10001 evidence && mkdir -p /app/runtime && chown -R evidence:evidence /app/runtime
USER evidence
EXPOSE 8090
CMD ["python","-m","uvicorn","evidencedesk.app:app","--host","0.0.0.0","--port","8090","--no-access-log"]

FROM node:24-bookworm-slim AS bridge
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY db ./db
USER node
CMD ["node","db/server.mjs"]

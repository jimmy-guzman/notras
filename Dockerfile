FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# --- deps ---
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

ENV CI="true"

RUN pnpm install --frozen-lockfile

# --- build ---
FROM base AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV STANDALONE="true"
ENV NODE_ENV="production"

RUN mkdir -p data && pnpm db:push && pnpm build

# --- runtime ---
FROM base AS runtime

WORKDIR /app

ENV NODE_ENV="production"
ENV HOSTNAME="0.0.0.0"
ENV PORT="3000"
ENV DATABASE_PATH="file:./data/notras.db"

RUN addgroup --system --gid 1001 notras && \
    adduser --system --uid 1001 --ingroup notras notras

RUN mkdir -p /app/data && chown notras:notras /app/data

COPY --from=build --chown=notras:notras /app/public ./public
COPY --from=build --chown=notras:notras /app/.next/standalone ./
COPY --from=build --chown=notras:notras /app/.next/static ./.next/static

USER notras

EXPOSE 3000

CMD ["node", "server.js"]

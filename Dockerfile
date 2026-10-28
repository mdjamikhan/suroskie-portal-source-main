# Production image for self-hosting (web app and/or the long-running sync worker).
#   docker build -t suroskie-portal .
#   docker run --env-file .env -p 3000:3000 suroskie-portal                 # web
#   docker run --env-file .env suroskie-portal npm run worker               # sync worker
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --uid 1001 --create-home app
COPY --from=build --chown=app /app ./
USER app
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT:-3000}"]

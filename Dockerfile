FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG APP_VERSION=local
RUN groupadd --system nextjs && useradd --system --gid nextjs nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN echo "${APP_VERSION}" > version.txt

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

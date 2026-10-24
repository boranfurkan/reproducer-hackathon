# Production image for ReProducer. Investigations run for minutes, so this runs as a long-lived container
# (Cloud Run with minimum instances 1, Railway, Fly, Render...), not as serverless functions.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generated route types and the production build. No secrets are needed at build time.
RUN npx next typegen && npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
# Secrets (GEMINI_API_KEY, MONGODB_URI, AUTH_*) are passed at run time by the host, never baked into the image.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]

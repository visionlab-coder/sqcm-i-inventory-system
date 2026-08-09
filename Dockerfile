FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY db ./db
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]

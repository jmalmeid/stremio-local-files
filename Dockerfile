FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=1222

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# The addon defaults to port 1222
EXPOSE 1222

# Storage file is created relative to the app by bin/addon.js:
# localAddon.startIndexing('./localFiles')
VOLUME ["/app/localFiles"]

CMD ["node", "bin/addon.js"]

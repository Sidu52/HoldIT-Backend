# ==========================================
# Multi-Stage Production Dockerfile
# ==========================================

# Base Stage
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# Dependencies Stage
FROM base AS dependencies
RUN npm ci --only=production

# Final Production Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system user for security
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Set permissions for non-root user
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "app.js"]

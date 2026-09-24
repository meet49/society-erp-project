# ---- build stage
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w apps/api

# ---- runtime stage
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
RUN mkdir -p /data/uploads && chown -R app:app /app /data
USER app
EXPOSE 4100
CMD ["node", "dist/server.js"]

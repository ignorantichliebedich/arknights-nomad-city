FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY assets/original-labs.json ./assets/original-labs.json
COPY assets/board-layout.json ./assets/board-layout.json
RUN pnpm exec vite build --config apps/web/vite.config.ts

FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/server ./apps/server
COPY packages ./packages
COPY assets/original-labs.json ./assets/original-labs.json
COPY tools/backup.ts ./tools/backup.ts
RUN mkdir -p /app/data /app/backups && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/nomad-city.sqlite BACKUP_DIR=/app/backups
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/server/src/index.ts"]

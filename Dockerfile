FROM node:24.20
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm run build
EXPOSE 3200
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/infrastructure/persistence/data-source.js && exec node dist/main.js"]
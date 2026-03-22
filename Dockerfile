FROM node:20-alpine AS base
WORKDIR /app

# Install deps
COPY package.json ./
RUN npm install --production=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/
COPY schema/ ./schema/

# Run migrations and start
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/index.ts"]

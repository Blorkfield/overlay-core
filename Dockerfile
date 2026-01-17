# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml* ./
COPY test-app/package.json ./test-app/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
COPY public ./public
COPY test-app ./test-app

# Build the main library
RUN pnpm build

# Build the test-app
WORKDIR /app/test-app
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm build

# Stage 2: Production
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/test-app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

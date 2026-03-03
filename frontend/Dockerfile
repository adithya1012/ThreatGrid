# ── Stage 1: Build Vite app ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_API_BASE_URL is empty so axios uses relative URLs → nginx proxies /api/*
RUN VITE_API_BASE_URL="" npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:stable-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

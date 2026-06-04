# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

# Supabase creds are baked into the bundle at build time (VITE_*). Pass them as
# build args in Coolify (Build → Build Variables). If omitted, the app builds
# fine and runs in guest / local-only mode.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: pnpm v10 hard-fails on un-approved dependency build scripts in
# CI. We don't need them — esbuild gets its binary from its optional platform
# package, and core-js's script is just a funding notice.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# ── serve ────────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

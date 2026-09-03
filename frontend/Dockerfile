FROM node:24-alpine AS consent-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend/oauth-consent-entry.js ./frontend/oauth-consent-entry.js
RUN npm run build:oauth-consent

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/index.html frontend/oauth-consent.html frontend/app.js frontend/ui-components.js frontend/styles.css frontend/oauth-consent.css frontend/brand.css frontend/experience.css frontend/evidence.css /usr/share/nginx/html/
COPY --from=consent-build /build/frontend/dist/oauth-consent.js /usr/share/nginx/html/oauth-consent.js
COPY src/public/assets /usr/share/nginx/html/assets
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q --spider http://127.0.0.1/health || exit 1

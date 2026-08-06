FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/index.html frontend/app.js frontend/styles.css frontend/brand.css /usr/share/nginx/html/
COPY src/public/assets /usr/share/nginx/html/assets
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q --spider http://127.0.0.1/health || exit 1

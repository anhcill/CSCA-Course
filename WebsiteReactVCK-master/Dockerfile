FROM node:24-bookworm-slim

# PDF/DOCX vision fallback requires page rendering in the production image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    libreoffice-writer \
    poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci && npm ci --prefix frontend

COPY . .
RUN npm run build --prefix frontend

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]

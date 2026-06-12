FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    ca-certificates \
    curl \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && ln -sf /usr/bin/python3 /usr/bin/python2 \
    && rm -rf /var/lib/apt/lists/*

ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

# Download latest yt-dlp binary and verify it works
RUN mkdir -p /app/node_modules/yt-dlp-exec/bin && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /app/node_modules/yt-dlp-exec/bin/yt-dlp && \
    chmod +x /app/node_modules/yt-dlp-exec/bin/yt-dlp && \
    /app/node_modules/yt-dlp-exec/bin/yt-dlp --version

COPY . .

RUN npm rebuild sharp

EXPOSE 3000

CMD ["node", "index.js"]
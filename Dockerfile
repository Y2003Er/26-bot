FROM node:22-bookworm-slim

WORKDIR /app

# 1. Install system dependencies
#    Add PostgreSQL APT repository to get pg_dump 17
RUN apt-get update && apt-get install -y wget gnupg && \
    echo "deb https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && apt-get install -y \
    ffmpeg \
    unzip \
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
    git \
    postgresql-client-17 \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && ln -sf /usr/bin/python3 /usr/bin/python2 \
    && rm -rf /var/lib/apt/lists/*

ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# 2. Copy package files and install node modules cleanly
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 3. Copy the rest of your application files FIRST
COPY . .

# 4. Rebuild sharp now that all project files are present
RUN npm rebuild sharp

# 5. NOW download yt-dlp into the generated folder structure
RUN mkdir -p /app/node_modules/yt-dlp-exec/bin && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /app/node_modules/yt-dlp-exec/bin/yt-dlp && \
    chmod +x /app/node_modules/yt-dlp-exec/bin/yt-dlp && \
    /app/node_modules/yt-dlp-exec/bin/yt-dlp --version

EXPOSE 3000

CMD ["node", "--expose-gc", "index.js"]

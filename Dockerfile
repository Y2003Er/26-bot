FROM node:20-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

# Weka binary ya yt-dlp mahali yt-dlp-exec inapotafuta
RUN mkdir -p /app/node_modules/yt-dlp-exec/bin && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /app/node_modules/yt-dlp-exec/bin/yt-dlp && \
    chmod a+rx /app/node_modules/yt-dlp-exec/bin/yt-dlp

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
FROM node:20-bookworm

WORKDIR /app

# Weka FFmpeg, Python 3, na zana za mfumo zinazohitajika na yt-dlp-exec
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]

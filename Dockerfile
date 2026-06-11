FROM node:20-bookworm

WORKDIR /app

# Weka FFmpeg na updates za mfumo kwanza
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]

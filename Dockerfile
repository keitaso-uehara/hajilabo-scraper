FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# 依存だけ先に入れてキャッシュ効かせる
COPY package*.json ./
RUN npm ci --omit=dev

# アプリ本体
COPY . .

# PORT は環境から渡される想定（ローカルは3000）
EXPOSE 3000

CMD ["npm", "start"]
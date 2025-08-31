# Node.js 20 の軽量イメージをベースにする
FROM node:20-slim

# 環境変数
ENV NODE_ENV=production
WORKDIR /app

# package.json と lock ファイルを先にコピーして依存をインストール
COPY package*.json ./
RUN npm ci --omit=dev

# アプリ本体をコピー
COPY . .

# PORTはPaperspaceが自動で渡してくる
EXPOSE 3000

# package.json に書いた "start": "node server.js" を呼ぶ
CMD ["npm", "start"]
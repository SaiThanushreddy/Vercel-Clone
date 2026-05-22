FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY index.js ./

EXPOSE 9000

USER node

CMD ["node", "index.js"]

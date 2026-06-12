FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY index.js ./
COPY src ./src
# Lauf-Modus: einmalig (für externen Scheduler/Cron) – oder per Loop-Wrapper betreiben
CMD ["node", "index.js"]

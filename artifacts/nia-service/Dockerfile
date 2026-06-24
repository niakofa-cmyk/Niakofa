FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
COPY migrate.sql ./migrate.sql
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
# cache bust Wed Jun 24 18:37:59 CDT 2026

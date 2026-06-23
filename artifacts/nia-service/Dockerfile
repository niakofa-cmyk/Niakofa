FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY dist/ ./dist/
COPY migrate.sql ./migrate.sql
RUN echo "built 1782251968"
EXPOSE 3001
CMD ["node", "dist/index.js"]

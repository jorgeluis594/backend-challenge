FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
COPY scripts/run-reminder-pass.sh ./scripts/
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/main.ts"]

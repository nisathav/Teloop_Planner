# Fleet Planner – single container with SQLite on a volume.
# docker build -t fleet-planner .
# docker run -p 3000:3000 -v fleet-data:/app/data -e ADMIN_PASSWORD=... -e AUTH_SECRET=... fleet-planner
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production DATABASE_URL="file:/app/data/fleet.db" PORT=3000
COPY --from=build /app ./
VOLUME /app/data
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed && npx next start -p ${PORT}"]

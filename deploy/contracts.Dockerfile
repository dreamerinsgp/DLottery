FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts
COPY contracts contracts
COPY shared shared
COPY backend/internal/lottery backend/internal/lottery
RUN npm run compile -w contracts && npm run export -w contracts
WORKDIR /app/contracts
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]

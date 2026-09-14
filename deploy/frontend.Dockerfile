FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY contracts/package.json contracts/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts
COPY frontend frontend
COPY shared shared
ARG VITE_RPC_URL=http://127.0.0.1:8545
ENV VITE_RPC_URL=$VITE_RPC_URL
ARG VITE_TEST_TOKEN_ADDRESS=
ENV VITE_TEST_TOKEN_ADDRESS=$VITE_TEST_TOKEN_ADDRESS
RUN npm run build -w frontend
FROM nginx:1.28-alpine
ENV PORT=80 \
    API_PROXY_TARGET=http://backend:8081 \
    NGINX_ENVSUBST_FILTER="^(PORT|API_PROXY_TARGET)$"
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY relay.mjs ./
USER node
ENV PORT=7777 NODE_ENV=production
EXPOSE 7777
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:7777/healthz || exit 1
CMD ["node", "relay.mjs"]

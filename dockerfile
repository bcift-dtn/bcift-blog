FROM node:24-alpine

RUN mkdir -p /home/node/app/data && chown -R node:node /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node package*.json ./

USER node

# Install dependencies needed for Astro
RUN npm ci

COPY --chown=node:node . .

# Build
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV CMS_DATA_DIR=/home/node/app/data

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
ARG IMAGE_VERSION=14.11
FROM mhart/alpine-node:${IMAGE_VERSION}

LABEL cproject-url="https://github.com/ma-ha/aks-nsg-ingress-ban-ip"

# Create app directory
RUN mkdir -p /app
WORKDIR /app

# Install app dependencies (as re-usable layer)
COPY app/package.json /app/
RUN npm install

# Bundle app source
COPY app/ /app

# Create application user 
RUN addgroup -g 1001 blacklister && \
    adduser -u 1001 -G blacklister -h /app -s /bin/sh -D blacklister && \
    chown -R blacklister:blacklister /app

USER blacklister:blacklister 

VOLUME /app/config

CMD ls -al
CMD node app.js

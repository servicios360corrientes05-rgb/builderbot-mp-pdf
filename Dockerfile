FROM ghcr.io/puppeteer/puppeteer:latest

# Las variables de entorno le dicen a Puppeteer que use el Chrome instalado en esta imagen base
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 3000

# Iniciar el servidor
CMD ["node", "server.js"]

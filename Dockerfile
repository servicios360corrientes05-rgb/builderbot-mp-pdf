FROM ghcr.io/puppeteer/puppeteer:latest

# Cambiar a root para poder instalar cosas y crear directorios
USER root

WORKDIR /usr/src/app

# Copiar package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Dar permisos al usuario de Puppeteer
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

# Exponer el puerto
EXPOSE 3000

# Iniciar el servidor
CMD ["node", "server.js"]

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

# Expose the port the Express app will listen on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

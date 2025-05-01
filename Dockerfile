# Use official Node.js 18 image
FROM node:22

# Set working directory
WORKDIR /app

# Copy dependencies
COPY package*.json ./

# Install packages
RUN npm install

# Copy the entire project
COPY . .

# Expose port Elastic Beanstalk expects
EXPOSE 8080

# Start the app on the correct port
CMD ["node", "server.js"]

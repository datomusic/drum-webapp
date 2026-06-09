# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifest only (omit lockfile to avoid npm's platform-specific
# optional-dependency bug: https://github.com/npm/cli/issues/4828)
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 3001 (as per deployment plan)
EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]

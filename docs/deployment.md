# Vutto | Production Deployment Strategy

This document details the production deployment, scaling, containerization, and reverse-proxy strategies for the Vutto Bike Auction Platform.

---

## 1. Containerization (Dockerfile)

Below is the optimized `Dockerfile` for deploying Vutto in a containerized environment (e.g. AWS ECS, GCP Cloud Run, or Kubernetes).

```dockerfile
# Multi-stage build for micro size
FROM node:22-alpine AS runner

WORKDIR /app

# Copy application source files
COPY server/ ./server/
COPY public/ ./public/
COPY .env* ./

# Configure production environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Run native node server
CMD ["node", "server/index.js"]
```

---

## 2. Reverse Proxy Configuration (Nginx)

When deploying to production, it is best practice to place a reverse proxy like **Nginx** in front of the Node.js process to handle SSL termination, rate limiting, static asset caching, and request buffering.

> [!WARNING]
> Because Server-Sent Events (SSE) rely on a persistent open HTTP connection, Nginx's default response buffering must be disabled. Otherwise, events will be delayed or bundled together.

### Recommended Nginx Server Block:
```nginx
server {
    listen 85.12.13.14:443 ssl http2;
    server_name bikeauction.com;

    ssl_certificate /etc/letsencrypt/live/bikeauction.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bikeauction.com/privkey.pem;

    # Static Assets Cache Control
    location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|svg|woff2)$ {
        root /var/www/vutto/public;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # REST APIs & SPA routing
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Server-Sent Events (SSE) Proxy Rules (Crucial for real-time channels)
    location ~ ^/api/(auctions|observability)/.*/stream {
        proxy_pass http://127.0.0.1:5000;
        
        # Turn off buffering and caching for instantaneous updates
        proxy_buffering off;
        proxy_cache off;
        
        # Keep connection open indefinitely
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        
        # Keep-Alive Connection setup
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        
        chunked_transfer_encoding on;
    }
}
```

---

## 3. Database Scaling & Volume Backups

While SQLite is highly optimized, it writes sequentially. For production deployments with extreme scale, the platform can be easily adjusted to support distributed databases:
*   **Database Switching**: The SQL queries are standard SQLite/ANSI SQL. The query interface can be mapped to PostgreSQL or MySQL by swapping the database driver file in `server/db/connection.js` and matching the syntax.
*   **SQLite backups**: If continuing to use SQLite, backups can be completed with zero downtime using the SQLite Online Backup API or running an automated cron job:
    ```bash
    sqlite3 database.db ".backup 'backups/backup-$(date +%F-%T).db'"
    ```

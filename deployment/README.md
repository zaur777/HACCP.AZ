# VPS Deployment Guide for SafeFood HACCP

This guide explains how to deploy your application to a VPS (e.g., DigitalOcean, Linode, AWS EC2).

## 1. Prerequisites
- A VPS running Ubuntu (recommended) or another Linux distribution.
- Node.js (v18+) and npm installed.
- PostgreSQL installed and running (or a remote database URL).
- A domain name pointing to your VPS IP address.

## 2. Environment Setup
Create a `.env` file in the root of your project on the VPS. You can use `.env.example` as a template.

```bash
# Example .env
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=haccp_az
DB_USER=haccp_az
DB_PASSWORD=your_secure_password
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
APP_URL=https://your-domain.com
```

## 3. Nginx Configuration
1.  Install Nginx: `sudo apt update && sudo apt install nginx`
2.  Copy the provided `nginx.conf` to `/etc/nginx/sites-available/safefood-haccp`.
3.  Edit the file to replace `your-domain.com` with your actual domain.
4.  Enable the site: `sudo ln -s /etc/nginx/sites-available/safefood-haccp /etc/nginx/sites-enabled/`
5.  Test the config: `sudo nginx -t`
6.  Restart Nginx: `sudo systemctl restart nginx`

### SSL with Certbot
To enable HTTPS, run:
`sudo apt install certbot python3-certbot-nginx`
`sudo certbot --nginx -d your-domain.com`

## 4. Deployment Script
1.  Make the script executable: `chmod +x deployment/deploy.sh`
2.  Run the script: `./deployment/deploy.sh`

The script will:
- Install dependencies.
- Build the React frontend.
- Start/Restart the application using **PM2**.

## 5. PM2 Management
- View logs: `pm2 logs safefood-haccp`
- View status: `pm2 status`
- Restart app: `pm2 restart safefood-haccp`
- Stop app: `pm2 stop safefood-haccp`

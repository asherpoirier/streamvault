# StreamVault - M3U8 Playlist Viewer

A web application for managing and streaming M3U8/IPTV playlists.

## Features

- **Admin Dashboard**: Manage playlists and users
- **Channel Search**: Search across all providers
- **Web Player**: Play HLS and MPEG-TS streams directly in browser
- **Copy URL**: Easy copy stream URLs for use in VLC
- **Dark Theme**: Modern, clean dark interface

## Supported Stream Formats

| Format | Extension | Library |
|--------|-----------|---------|
| HLS | .m3u8, .m3u | hls.js |
| MPEG-TS | .ts, extensionless | mpegts.js |

## Requirements

- Ubuntu 24.04 LTS
- 2GB RAM minimum (4GB recommended)
- 20GB disk space
- Root/sudo access

## Quick Installation

```bash
# Download and run the installer
sudo bash install.sh
```

The installer will:
1. Install Node.js 20.x
2. Install Python 3.11+
3. Install MongoDB 7.0
4. Install and configure Nginx
5. Set up the application
6. Create systemd services
7. Configure the firewall

## Manual Installation

If you prefer to install manually, follow these steps:

### 1. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# Install Python
sudo apt install -y python3 python3-pip python3-venv

# Install MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx
sudo apt install -y nginx
```

### 2. Setup Backend

```bash
cd /opt/streamvault/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=streamvault
JWT_SECRET=$(openssl rand -hex 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EOF
```

### 3. Setup Frontend

```bash
cd /opt/streamvault/frontend

# Create .env file
cat > .env << EOF
REACT_APP_BACKEND_URL=http://your-domain.com/api
EOF

# Install dependencies and build
yarn install
yarn build
```

### 4. Configure Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /opt/streamvault/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }
}
```

### 5. Create Systemd Service

```bash
sudo cat > /etc/systemd/system/streamvault-backend.service << EOF
[Unit]
Description=StreamVault Backend
After=network.target mongod.service

[Service]
Type=simple
User=streamvault
WorkingDirectory=/opt/streamvault/backend
Environment="PATH=/opt/streamvault/backend/venv/bin"
ExecStart=/opt/streamvault/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable streamvault-backend
sudo systemctl start streamvault-backend
```

## Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MONGO_URL | MongoDB connection string | mongodb://localhost:27017 |
| DB_NAME | Database name | streamvault |
| JWT_SECRET | Secret key for JWT tokens | (random) |
| JWT_ALGORITHM | JWT algorithm | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiry | 1440 |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| REACT_APP_BACKEND_URL | Backend API URL |

## Service Management

```bash
# Check status
sudo systemctl status streamvault-backend

# Restart service
sudo systemctl restart streamvault-backend

# View logs
sudo journalctl -u streamvault-backend -f

# Stop service
sudo systemctl stop streamvault-backend
```

## HTTPS Setup (Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Troubleshooting

### Backend won't start

1. Check logs: `sudo journalctl -u streamvault-backend -f`
2. Verify MongoDB is running: `sudo systemctl status mongod`
3. Check .env file exists and has correct values

### Streams not playing

1. Some streams require specific IP addresses (provider restrictions)
2. Try copying the URL and playing in VLC
3. Check browser console for errors

### 502 Bad Gateway

1. Backend service may not be running
2. Check: `sudo systemctl status streamvault-backend`
3. Restart: `sudo systemctl restart streamvault-backend`

## Uninstallation

```bash
sudo bash uninstall.sh
```

## License

MIT License

## Support

For issues and feature requests, please open an issue on the repository.

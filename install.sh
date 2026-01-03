#!/bin/bash

#===============================================================================
# StreamVault - M3U8 Playlist Viewer
# Automated Installer for Ubuntu 24.04
# 
# This script will install:
# - Node.js 20.x
# - Python 3.11+
# - MongoDB 7.0
# - Nginx
# - All application dependencies
#===============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="streamvault"
APP_DIR="/opt/$APP_NAME"
APP_USER="streamvault"
DOMAIN=""
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
JWT_SECRET=$(openssl rand -hex 32)
BACKEND_PORT=8001
FRONTEND_PORT=3000

#===============================================================================
# Helper Functions
#===============================================================================

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║   StreamVault - M3U8 Playlist Viewer Installer                ║"
    echo "║   For Ubuntu 24.04                                            ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}==>${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

get_user_input() {
    log_step "Configuration"
    
    # Get domain/IP
    read -p "Enter domain name or IP address (e.g., example.com or 192.168.1.100): " DOMAIN
    if [[ -z "$DOMAIN" ]]; then
        DOMAIN="localhost"
        log_warn "No domain specified, using 'localhost'"
    fi
    
    # Get admin credentials
    read -p "Enter admin username: " ADMIN_USERNAME
    if [[ -z "$ADMIN_USERNAME" ]]; then
        ADMIN_USERNAME="admin"
        log_warn "No username specified, using 'admin'"
    fi
    
    while true; do
        read -s -p "Enter admin password (min 8 characters): " ADMIN_PASSWORD
        echo
        if [[ ${#ADMIN_PASSWORD} -ge 8 ]]; then
            break
        fi
        log_error "Password must be at least 8 characters"
    done
    
    echo
    log_info "Configuration:"
    log_info "  Domain: $DOMAIN"
    log_info "  Admin Username: $ADMIN_USERNAME"
    log_info "  App Directory: $APP_DIR"
    echo
    read -p "Continue with installation? (y/n): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
}

#===============================================================================
# Installation Functions
#===============================================================================

install_system_dependencies() {
    log_step "Installing system dependencies..."
    
    apt-get update
    apt-get install -y \
        curl \
        wget \
        gnupg \
        ca-certificates \
        lsb-release \
        software-properties-common \
        build-essential \
        git \
        openssl \
        ufw
    
    log_info "System dependencies installed"
}

install_nodejs() {
    log_step "Installing Node.js 20.x..."
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -ge 18 ]]; then
            log_info "Node.js $(node -v) already installed"
            return
        fi
    fi
    
    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Install yarn globally
    npm install -g yarn
    
    log_info "Node.js $(node -v) and Yarn $(yarn -v) installed"
}

install_python() {
    log_step "Installing Python 3.11+..."
    
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev
    
    log_info "Python $(python3 --version) installed"
}

install_mongodb() {
    log_step "Installing MongoDB 7.0..."
    
    # Check if MongoDB is already installed
    if command -v mongod &> /dev/null; then
        log_info "MongoDB already installed"
        systemctl start mongod || true
        systemctl enable mongod || true
        return
    fi
    
    # Import MongoDB GPG key
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    # Add MongoDB repository
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    apt-get update
    apt-get install -y mongodb-org
    
    # Start and enable MongoDB
    systemctl start mongod
    systemctl enable mongod
    
    # Wait for MongoDB to start
    sleep 3
    
    log_info "MongoDB installed and started"
}

install_nginx() {
    log_step "Installing Nginx..."
    
    apt-get install -y nginx
    
    systemctl start nginx
    systemctl enable nginx
    
    log_info "Nginx installed and started"
}

create_app_user() {
    log_step "Creating application user..."
    
    if id "$APP_USER" &>/dev/null; then
        log_info "User '$APP_USER' already exists"
    else
        useradd -r -s /bin/false -m -d /home/$APP_USER $APP_USER
        log_info "User '$APP_USER' created"
    fi
}

setup_application() {
    log_step "Setting up application..."
    
    # Create app directory
    mkdir -p $APP_DIR
    
    # Copy application files
    cp -r /app/backend $APP_DIR/
    cp -r /app/frontend $APP_DIR/
    
    # Create backend .env file
    cat > $APP_DIR/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=streamvault
JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EOF
    
    log_info "Backend environment configured"
    
    # Setup Python virtual environment
    log_info "Setting up Python virtual environment..."
    cd $APP_DIR/backend
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
    
    log_info "Python dependencies installed"
    
    # Create frontend .env file
    if [[ "$DOMAIN" == "localhost" ]]; then
        BACKEND_URL="http://localhost/api"
    else
        BACKEND_URL="http://$DOMAIN/api"
    fi
    
    cat > $APP_DIR/frontend/.env << EOF
REACT_APP_BACKEND_URL=$BACKEND_URL
EOF
    
    log_info "Frontend environment configured"
    
    # Build frontend
    log_info "Building frontend (this may take a few minutes)..."
    cd $APP_DIR/frontend
    yarn install
    yarn build
    
    log_info "Frontend built successfully"
    
    # Set ownership
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    log_info "Application setup complete"
}

create_admin_user() {
    log_step "Creating admin user..."
    
    # Create a Python script to create the admin user
    cat > /tmp/create_admin.py << EOF
import asyncio
import os
import sys
sys.path.insert(0, '$APP_DIR/backend')

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from uuid import uuid4
from datetime import datetime, timezone

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["streamvault"]
    
    # Check if admin exists
    existing = await db.users.find_one({"username": "$ADMIN_USERNAME"})
    if existing:
        print("Admin user already exists")
        return
    
    # Create admin user
    user = {
        "id": str(uuid4()),
        "username": "$ADMIN_USERNAME",
        "hashed_password": pwd_context.hash("$ADMIN_PASSWORD"),
        "is_admin": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user)
    print(f"Admin user '{user['username']}' created successfully")
    
    client.close()

asyncio.run(create_admin())
EOF
    
    cd $APP_DIR/backend
    source venv/bin/activate
    python3 /tmp/create_admin.py
    deactivate
    rm /tmp/create_admin.py
    
    log_info "Admin user created"
}

create_systemd_services() {
    log_step "Creating systemd services..."
    
    # Backend service
    cat > /etc/systemd/system/streamvault-backend.service << EOF
[Unit]
Description=StreamVault Backend API
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/backend/venv/bin"
ExecStart=$APP_DIR/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port $BACKEND_PORT
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    log_info "Backend service created"
    
    # Reload systemd and start services
    systemctl daemon-reload
    systemctl enable streamvault-backend
    systemctl start streamvault-backend
    
    log_info "Backend service started"
}

configure_nginx() {
    log_step "Configuring Nginx..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Create StreamVault nginx config
    cat > /etc/nginx/sites-available/streamvault << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Frontend - serve static files
    location / {
        root $APP_DIR/frontend/build;
        index index.html;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # For streaming
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    # Increase max body size for uploads
    client_max_body_size 100M;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json;
    gzip_disable "MSIE [1-6]\.";
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/streamvault /etc/nginx/sites-enabled/
    
    # Test nginx config
    nginx -t
    
    # Reload nginx
    systemctl reload nginx
    
    log_info "Nginx configured"
}

configure_firewall() {
    log_step "Configuring firewall..."
    
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    
    # Enable firewall if not already enabled
    echo "y" | ufw enable || true
    
    log_info "Firewall configured"
}

print_completion() {
    echo
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║   Installation Complete!                                      ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo
    echo -e "${BLUE}Access your application:${NC}"
    if [[ "$DOMAIN" == "localhost" ]]; then
        echo "  URL: http://localhost"
    else
        echo "  URL: http://$DOMAIN"
    fi
    echo
    echo -e "${BLUE}Admin credentials:${NC}"
    echo "  Username: $ADMIN_USERNAME"
    echo "  Password: (the password you entered)"
    echo
    echo -e "${BLUE}Service management:${NC}"
    echo "  sudo systemctl status streamvault-backend"
    echo "  sudo systemctl restart streamvault-backend"
    echo "  sudo systemctl stop streamvault-backend"
    echo
    echo -e "${BLUE}Log files:${NC}"
    echo "  Backend: sudo journalctl -u streamvault-backend -f"
    echo "  Nginx: /var/log/nginx/access.log"
    echo
    echo -e "${BLUE}Application files:${NC}"
    echo "  Directory: $APP_DIR"
    echo "  Backend config: $APP_DIR/backend/.env"
    echo "  Frontend config: $APP_DIR/frontend/.env"
    echo
    echo -e "${YELLOW}Note: For HTTPS, consider using Let's Encrypt:${NC}"
    echo "  sudo apt install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d $DOMAIN"
    echo
}

#===============================================================================
# Main Installation
#===============================================================================

main() {
    print_banner
    check_root
    get_user_input
    
    log_step "Starting installation..."
    
    install_system_dependencies
    install_nodejs
    install_python
    install_mongodb
    install_nginx
    create_app_user
    setup_application
    create_admin_user
    create_systemd_services
    configure_nginx
    configure_firewall
    
    print_completion
}

# Run main function
main "$@"

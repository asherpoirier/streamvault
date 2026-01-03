#!/bin/bash

#===============================================================================
# StreamVault - M3U8 Playlist Viewer
# Automated Installer for Ubuntu 24.04
# 
# Usage:
#   Interactive:    sudo ./install.sh
#   Non-interactive: sudo ./install.sh --domain example.com --admin-user admin --admin-pass MyPassword123
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

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

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

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --domain DOMAIN       Domain name or IP (default: localhost)"
    echo "  --admin-user USER     Admin username (default: admin)"
    echo "  --admin-pass PASS     Admin password (required, min 8 chars)"
    echo "  --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  Interactive mode:"
    echo "    sudo ./install.sh"
    echo ""
    echo "  Non-interactive mode:"
    echo "    sudo ./install.sh --domain myserver.com --admin-user admin --admin-pass MySecurePass123"
    echo ""
    echo "  One-liner install:"
    echo "    curl -fsSL https://raw.githubusercontent.com/asherpoirier/streamvault/main/bootstrap.sh | sudo bash -s -- --domain myserver.com --admin-user admin --admin-pass MySecurePass123"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_source_files() {
    if [[ ! -d "$SCRIPT_DIR/backend" ]] || [[ ! -d "$SCRIPT_DIR/frontend" ]]; then
        log_error "Source files not found!"
        log_error "Expected 'backend' and 'frontend' directories in: $SCRIPT_DIR"
        exit 1
    fi
    log_info "Source files found in $SCRIPT_DIR"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                DOMAIN="$2"
                shift 2
                ;;
            --admin-user)
                ADMIN_USERNAME="$2"
                shift 2
                ;;
            --admin-pass)
                ADMIN_PASSWORD="$2"
                shift 2
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

get_user_input() {
    log_step "Configuration"
    
    # Check if we have all required args for non-interactive mode
    if [[ -n "$ADMIN_PASSWORD" ]]; then
        # Non-interactive mode
        [[ -z "$DOMAIN" ]] && DOMAIN="localhost"
        [[ -z "$ADMIN_USERNAME" ]] && ADMIN_USERNAME="admin"
        
        log_info "Running in non-interactive mode"
        log_info "  Domain: $DOMAIN"
        log_info "  Admin Username: $ADMIN_USERNAME"
        log_info "  App Directory: $APP_DIR"
        return
    fi
    
    # Interactive mode - check if stdin is a terminal
    if [[ ! -t 0 ]]; then
        log_error "Running non-interactively but missing required arguments!"
        echo ""
        show_usage
        exit 1
    fi
    
    # Get domain/IP
    read -p "Enter domain name or IP address (e.g., example.com or 192.168.1.100): " DOMAIN
    if [[ -z "$DOMAIN" ]]; then
        DOMAIN="localhost"
        log_warn "No domain specified, using 'localhost'"
    fi
    
    # Get admin credentials
    read -p "Enter admin username [admin]: " ADMIN_USERNAME
    if [[ -z "$ADMIN_USERNAME" ]]; then
        ADMIN_USERNAME="admin"
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

validate_config() {
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        log_error "Admin password is required!"
        show_usage
        exit 1
    fi
    
    if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
        log_error "Admin password must be at least 8 characters!"
        exit 1
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
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -ge 18 ]]; then
            log_info "Node.js $(node -v) already installed"
            if ! command -v yarn &> /dev/null; then
                npm install -g yarn
            fi
            return
        fi
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
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
    
    if command -v mongod &> /dev/null; then
        log_info "MongoDB already installed"
        systemctl start mongod || true
        systemctl enable mongod || true
        return
    fi
    
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
    
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    
    apt-get update
    apt-get install -y mongodb-org
    
    systemctl start mongod
    systemctl enable mongod
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
    
    mkdir -p $APP_DIR
    
    log_info "Copying backend files..."
    cp -r "$SCRIPT_DIR/backend" $APP_DIR/
    
    log_info "Copying frontend files..."
    cp -r "$SCRIPT_DIR/frontend" $APP_DIR/
    
    # Backend .env
    cat > $APP_DIR/backend/.env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=streamvault
JWT_SECRET=$JWT_SECRET
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EOF
    
    log_info "Backend environment configured"
    
    # Python venv
    log_info "Setting up Python virtual environment..."
    cd $APP_DIR/backend
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    deactivate
    
    log_info "Python dependencies installed"
    
    # Frontend .env
    # Note: Don't include /api - nginx proxies /api/ to backend
    if [[ "$DOMAIN" == "localhost" ]]; then
        BACKEND_URL="http://localhost"
    else
        BACKEND_URL="http://$DOMAIN"
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
    
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    log_info "Application setup complete"
}

create_admin_user() {
    log_step "Creating admin user..."
    
    cat > /tmp/create_admin.py << EOF
import asyncio
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
    
    existing = await db.users.find_one({"username": "$ADMIN_USERNAME"})
    if existing:
        print("Admin user already exists")
        return
    
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
    
    systemctl daemon-reload
    systemctl enable streamvault-backend
    systemctl start streamvault-backend
    
    log_info "Backend service started"
}

configure_nginx() {
    log_step "Configuring Nginx..."
    
    rm -f /etc/nginx/sites-enabled/default
    
    cat > /etc/nginx/sites-available/streamvault << 'NGINXEOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    
    location / {
        root /opt/streamvault/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
    
    client_max_body_size 100M;
    
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript application/json;
}
NGINXEOF
    
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/streamvault
    
    ln -sf /etc/nginx/sites-available/streamvault /etc/nginx/sites-enabled/
    
    nginx -t
    systemctl reload nginx
    
    log_info "Nginx configured"
}

configure_firewall() {
    log_step "Configuring firewall..."
    
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
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
    echo "  Password: (the password you specified)"
    echo
    echo -e "${BLUE}Service management:${NC}"
    echo "  sudo systemctl status streamvault-backend"
    echo "  sudo systemctl restart streamvault-backend"
    echo
    echo -e "${BLUE}Logs:${NC}"
    echo "  sudo journalctl -u streamvault-backend -f"
    echo
    echo -e "${YELLOW}For HTTPS:${NC}"
    echo "  sudo apt install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d $DOMAIN"
    echo
}

#===============================================================================
# Main
#===============================================================================

main() {
    print_banner
    check_root
    parse_args "$@"
    check_source_files
    get_user_input
    validate_config
    
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

main "$@"

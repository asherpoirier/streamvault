#!/bin/bash

#===============================================================================
# StreamVault - Uninstaller
# Removes the StreamVault application from Ubuntu
#===============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="streamvault"
APP_DIR="/opt/$APP_NAME"
APP_USER="streamvault"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   StreamVault Uninstaller                                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

check_root

echo -e "${YELLOW}This will remove:${NC}"
echo "  - StreamVault application files ($APP_DIR)"
echo "  - Systemd service (streamvault-backend)"
echo "  - Nginx configuration"
echo "  - Application user ($APP_USER)"
echo
echo -e "${YELLOW}This will NOT remove:${NC}"
echo "  - MongoDB (and its data)"
echo "  - Node.js"
echo "  - Python"
echo "  - Nginx (only the config)"
echo

read -p "Are you sure you want to uninstall StreamVault? (y/n): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    log_info "Uninstall cancelled"
    exit 0
fi

# Stop and disable services
log_info "Stopping services..."
systemctl stop streamvault-backend 2>/dev/null || true
systemctl disable streamvault-backend 2>/dev/null || true

# Remove systemd service
log_info "Removing systemd service..."
rm -f /etc/systemd/system/streamvault-backend.service
systemctl daemon-reload

# Remove nginx config
log_info "Removing nginx configuration..."
rm -f /etc/nginx/sites-enabled/streamvault
rm -f /etc/nginx/sites-available/streamvault
systemctl reload nginx 2>/dev/null || true

# Remove application directory
log_info "Removing application files..."
rm -rf $APP_DIR

# Remove user
log_info "Removing application user..."
userdel -r $APP_USER 2>/dev/null || true

echo
log_info "StreamVault has been uninstalled"
echo
echo -e "${YELLOW}Note: MongoDB data is preserved. To remove it:${NC}"
echo "  sudo systemctl stop mongod"
echo "  sudo apt remove --purge mongodb-org*"
echo "  sudo rm -rf /var/lib/mongodb"
echo

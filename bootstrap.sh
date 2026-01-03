#!/bin/bash

#===============================================================================
# StreamVault - One-Line Installer Bootstrap
# 
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/streamvault/main/bootstrap.sh | sudo bash
#
# Or with wget:
#   wget -qO- https://raw.githubusercontent.com/YOUR_USERNAME/streamvault/main/bootstrap.sh | sudo bash
#===============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="https://github.com/YOUR_USERNAME/streamvault.git"
INSTALL_DIR="/tmp/streamvault-install"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   StreamVault - One-Line Installer                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)"
    exit 1
fi

# Install git if not present
if ! command -v git &> /dev/null; then
    echo -e "${GREEN}[INFO]${NC} Installing git..."
    apt-get update
    apt-get install -y git
fi

# Clean up any previous install attempts
rm -rf "$INSTALL_DIR"

# Clone the repository
echo -e "${GREEN}[INFO]${NC} Downloading StreamVault..."
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"

# Run the installer
echo -e "${GREEN}[INFO]${NC} Starting installation..."
cd "$INSTALL_DIR"
chmod +x install.sh
./install.sh

# Cleanup
echo -e "${GREEN}[INFO]${NC} Cleaning up temporary files..."
rm -rf "$INSTALL_DIR"

echo -e "${GREEN}[INFO]${NC} Bootstrap complete!"

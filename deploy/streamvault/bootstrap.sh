#!/bin/bash

#===============================================================================
# StreamVault - One-Line Installer Bootstrap
# 
# Usage (interactive):
#   curl -fsSL https://raw.githubusercontent.com/asherpoirier/streamvault/main/bootstrap.sh -o bootstrap.sh && sudo bash bootstrap.sh
#
# Usage (non-interactive):
#   curl -fsSL https://raw.githubusercontent.com/asherpoirier/streamvault/main/bootstrap.sh | sudo bash -s -- --domain example.com --admin-user admin --admin-pass MyPassword123
#===============================================================================

set -e

REPO_URL="https://github.com/asherpoirier/streamvault.git"
INSTALL_DIR="/tmp/streamvault-install"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   StreamVault - One-Line Installer                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "[ERROR] This script must be run as root (use sudo)"
    exit 1
fi

# Install git if not present
if ! command -v git &> /dev/null; then
    echo "[INFO] Installing git..."
    apt-get update
    apt-get install -y git
fi

# Clean up any previous install attempts
rm -rf "$INSTALL_DIR"

# Clone the repository
echo "[INFO] Downloading StreamVault..."
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"

# Run the installer with any passed arguments
echo "[INFO] Starting installation..."
cd "$INSTALL_DIR"
chmod +x install.sh
./install.sh "$@"

# Cleanup
echo "[INFO] Cleaning up temporary files..."
rm -rf "$INSTALL_DIR"

echo "[INFO] Bootstrap complete!"

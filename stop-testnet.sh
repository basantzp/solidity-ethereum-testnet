#!/usr/bin/env bash
# ==============================================================================
# stop-testnet.sh - Gracefully Stop Solidity Ethereum Testnet
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f .node.pid ]; then
    NODE_PID=$(cat .node.pid)
    kill "$NODE_PID" 2>/dev/null || true
    rm -f .node.pid
fi

if [ -f .server.pid ]; then
    SERVER_PID=$(cat .server.pid)
    kill "$SERVER_PID" 2>/dev/null || true
    rm -f .server.pid
fi

# Cleanup by port
fuser -k 8545/tcp 2>/dev/null || true
fuser -k 3300/tcp 2>/dev/null || true

echo "✅ Solidity Ethereum Testnet stopped."

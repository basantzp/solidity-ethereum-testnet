#!/usr/bin/env bash
# ==============================================================================
# start-testnet.sh - Launch Solidity Ethereum Testnet Node & Block Explorer
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "  ⚡ Starting Solidity Ethereum Testnet (SETH) Suite"
echo "========================================================"

# 1. Kill any existing instances
./stop-testnet.sh 2>/dev/null || true

# 2. Start Hardhat node with setsid
echo "[*] Step 1: Starting local EVM RPC Node (http://127.0.0.1:8545)..."
setsid npx hardhat node </dev/null > hardhat-node.log 2>&1 &
echo $! > .node.pid
sleep 2

# 3. Deploy contracts to persistent localhost network
echo "[*] Step 2: Deploying Solidity Testnet State Machine..."
npx hardhat run scripts/deploy.js --network localhost

# 4. Start Server with setsid
echo "[*] Step 3: Starting Web Explorer on http://localhost:3300..."
setsid node server.js </dev/null > server.log 2>&1 &
echo $! > .server.pid
sleep 1

echo "========================================================"
echo "  [✓] SOLIDITY ETHEREUM TESTNET IS LIVE!"
echo "========================================================"
echo "  🌐 Web Explorer & Faucet : http://localhost:3300"
echo "  ⛓️  RPC Endpoint         : http://127.0.0.1:8545"
echo "  🪙  Chain ID              : 13371337 (SETH)"
echo "  💻 CLI Tool Command      : node cli.js status"
echo "  🛑 Stop Script            : ./stop-testnet.sh"

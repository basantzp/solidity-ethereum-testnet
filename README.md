<div align="center">

# ⚡ Solidity Ethereum Testnet (SETH)
### 100% Solidity-Native Ethereum Testnet Engine, State Ledger, Virtual Block Simulator & On-Chain Consensus Sandbox

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Solidity 0.8.24](https://img.shields.io/badge/Solidity-0.8.24-363636?style=for-the-badge&logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22-FFF100?style=for-the-badge&logo=hardhat&logoColor=black)](https://hardhat.org/)
[![Ethers.js v6](https://img.shields.io/badge/Ethers.js-v6.11-2656C7?style=for-the-badge&logoColor=white)](https://docs.ethers.org/)
[![Express API](https://img.shields.io/badge/Express-API_Server-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbasantzp%2Fsolidity-ethereum-testnet)

<p align="center">
  <b>A complete, self-contained Ethereum virtual network where the blockchain ledger, account balances, transaction pipeline, Genesis state, virtual contract deployments, miner block rewards, and Proof-of-Authority (PoA) consensus are implemented entirely in Solidity smart contracts.</b>
</p>

</div>

---

## 📖 Overview

Most Ethereum testnets rely on external Go/Rust/C++ clients (Geth, Besu, Nethermind, Erigon) to manage state transitions. 

**`Solidity Ethereum Testnet (SETH)`** takes an innovative, pure smart contract approach: the **entire blockchain state machine, block validation, gas accounting, transaction pool, and block engine are encoded in Solidity contracts**.

### 🌟 Key Features
- **🪙 Native Currency (SETH)**: Complete on-chain account ledger tracking virtual balances, nonces, and transaction execution.
- **📦 Virtual Block Engine**: Validates block headers, packages transactions, computes Keccak-256 block hashes, and pays out +2.0 SETH block subsidies to validator miners.
- **💧 Built-in Rate-Limited Faucet**: Dispenses 5.0 SETH with automated cooldowns for testing.
- **📜 Virtual Contract Deployer**: Simulates contract creation bytecodes and computes deterministic contract addresses (`CREATE` opcode simulation).
- **🌐 Real-Time Web Block Explorer**: Beautiful dark-mode UI with live block feed, account inspector, faucet dispenser, and interactive transaction builder.
- **💻 Interactive CLI Runner**: Full-featured command-line interface for inspecting blocks, querying accounts, sending transactions, and mining blocks.

---

## 🏗️ Architecture & State Flow

```mermaid
flowchart TD
    A[Genesis Block 0 Initialized] --> B[Solidity Ethereum State Ledger<br/>accounts mapping: balance, nonce, codeHash]
    B --> C{Client Action}
    C -- Faucet Request --> D[requestFaucetFunds<br/>Drip 5.0 SETH + Cooldown]
    C -- Send Transaction --> E[sendTransaction<br/>Deduct Balance, Increment Nonce, Record Tx]
    C -- Deploy Contract --> F[deployContract<br/>Compute Contract Addr & CodeHash]
    D --> G[Pending Block Pool]
    E --> G
    F --> G
    G --> H[mineBlock<br/>Seal Block Hash, Package Tx Root, Credit Miner +2 SETH]
    H --> I[Updated Block Height #N]
```

---

## ⚡ Quickstart

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/basantzp/solidity-ethereum-testnet.git
cd solidity-ethereum-testnet

# Install dependencies
npm install
```

### 2. Run Automated Unit Tests
```bash
npx hardhat test
```
*Output:*
```text
  Solidity Ethereum Testnet (SETH)
    ✔ Should initialize Genesis Block 0 with correct ChainID and Admin Balance
    ✔ Should allow requesting funds from the testnet Faucet
    ✔ Should execute virtual value transfers between accounts
    ✔ Should deploy virtual smart contracts on the testnet
    ✔ Should mine blocks, package transactions, and pay miner subsidies

  5 passing (693ms)
```

---

### 3. Launch Testnet & Web Block Explorer in 1 Click
```bash
./start-testnet.sh
```
* **Web Block Explorer & Faucet UI**: `http://localhost:3300`
* **Local RPC Node**: `http://127.0.0.1:8545`
* **Chain ID**: `13371337` (`SETH`)

To gracefully stop the testnet at any time:
```bash
./stop-testnet.sh
```

---

## 💻 Interactive CLI Usage

Interact with the running Solidity testnet directly from your terminal:

```bash
# 1. View Chain Status & Current Block Height
node cli.js status

# 2. Display All Verified Blocks
node cli.js blocks

# 3. List All Registered Accounts & Balances
node cli.js accounts

# 4. Request 5 SETH from the Faucet
node cli.js faucet 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# 5. Send a Virtual Transaction (Alice to Bob)
node cli.js transfer 1 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 2.5

# 6. Mine the Next Block (Pay Miner Subsidy)
node cli.js mine
```

---

## 📄 Smart Contracts Overview

| Contract | Source File | Purpose |
| :--- | :--- | :--- |
| **`EthereumTestnet`** | [`contracts/EthereumTestnet.sol`](contracts/EthereumTestnet.sol) | Core state ledger, block producer, transaction pipeline, faucet, and validator consensus. |
| **`TestnetToken`** | [`contracts/TestnetToken.sol`](contracts/TestnetToken.sol) | ERC-20 token (`TUSD`) deployed on testnet for testing swaps, staking, and transfers. |
| **`SimpleStorage`** | [`contracts/SimpleStorage.sol`](contracts/SimpleStorage.sol) | Sample contract to demonstrate contract deployments and state mutations on SETH. |

---

## 🌐 REST API Endpoints

The built-in Express server provides JSON APIs on port `3300`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/stats` | Network summary, block height, total supply, and contract addresses. |
| `GET` | `/api/blocks` | Array of all mined blocks with timestamps, miner, gas, and tx count. |
| `GET` | `/api/accounts` | All registered EOAs and virtual contracts with live balances. |
| `POST` | `/api/faucet` | Dispenses 5.0 SETH to the requested `recipient`. |
| `POST` | `/api/transfer` | Dispatches a state transition transfer between virtual accounts. |
| `POST` | `/api/mine` | Mines the next block and awards +2.0 SETH to the miner. |

---

## 📜 License

Distributed under the [MIT License](LICENSE). Built with ❤️ by [Basant Pokhrel](https://github.com/basantzp).

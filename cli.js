#!/usr/bin/env node
/**
 * Solidity Ethereum Testnet (SETH) - CLI Tool
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");
const ARTIFACT_FILE = path.join(__dirname, "artifacts/contracts/EthereumTestnet.sol/EthereumTestnet.json");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

async function getContext() {
  if (!fs.existsSync(DEPLOYMENTS_FILE) || !fs.existsSync(ARTIFACT_FILE)) {
    console.error("[-] Testnet not deployed yet. Please run: ./start-testnet.sh or npm run deploy");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_FILE, "utf-8"));
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const testnet = new ethers.Contract(data.contracts.EthereumTestnet, artifact.abi, provider);
  return { testnet, data, provider };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "status";

  const { testnet, data, provider } = await getContext();

  switch (command) {
    case "status": {
      const summary = await testnet.getChainSummary();
      const latest = await testnet.getLatestBlock();
      console.log("\n========================================================");
      console.log(`  ⚡ ${summary[0]} (ChainID: ${summary[1]})`);
      console.log("========================================================");
      console.log(`  ├─ Current Block Height   : #${summary[2]}`);
      console.log(`  ├─ Latest Block Hash      : ${latest[1]}`);
      console.log(`  ├─ Total Transactions     : ${summary[3]}`);
      console.log(`  ├─ Contracts Deployed     : ${summary[4]}`);
      console.log(`  ├─ Total Network Supply   : ${ethers.formatEther(summary[5])} SETH`);
      console.log(`  └─ Core Contract Address  : ${data.contracts.EthereumTestnet}\n`);
      break;
    }

    case "blocks": {
      const summary = await testnet.getChainSummary();
      const height = Number(summary[2]);
      console.log(`\n📦 Displaying All ${height + 1} Blocks on Testnet:\n`);
      console.log("HEIGHT | HASH                                                               | MINER                                      | TXs | GAS");
      console.log("----------------------------------------------------------------------------------------------------------------------------------");
      for (let i = height; i >= 0; i--) {
        const b = await testnet.getBlock(i);
        console.log(`#${b[0].toString().padEnd(5)} | ${b[1]} | ${b[3]} | ${b[6].toString().padEnd(3)} | ${b[5]}`);
      }
      console.log("");
      break;
    }

    case "faucet": {
      const signer = await provider.getSigner(0);
      const recipient = args[1] || (await (await provider.getSigner(1)).getAddress());
      console.log(`\n💧 Requesting 5 SETH faucet funds for: ${recipient}...`);
      try {
        const writeContract = testnet.connect(signer);
        const tx = await writeContract.requestFaucetFunds(recipient);
        await tx.wait();
        const acc = await testnet.getAccount(recipient);
        console.log(`[✓] Faucet drip complete! New Balance: ${ethers.formatEther(acc[0])} SETH\n`);
      } catch (err) {
        console.error(`[-] Faucet error: ${err.message}`);
      }
      break;
    }

    case "transfer": {
      const signerIdx = parseInt(args[1] || "1");
      const sender = await provider.getSigner(signerIdx);
      const to = args[2] || (await (await provider.getSigner(2)).getAddress());
      const amountEth = args[3] || "1.0";

      console.log(`\n💸 Sending ${amountEth} SETH from ${await sender.getAddress()} to ${to}...`);
      try {
        const writeContract = testnet.connect(sender);
        const tx = await writeContract.sendTransaction(to, ethers.parseEther(amountEth), "0x");
        const receipt = await tx.wait();
        console.log(`[✓] Transaction submitted! TxHash: ${receipt.hash}\n`);
      } catch (err) {
        console.error(`[-] Transfer error: ${err.message}`);
      }
      break;
    }

    case "mine": {
      const signer = await provider.getSigner(0);
      const miner = args[1] || (await (await provider.getSigner(3)).getAddress());
      const tag = ethers.encodeBytes32String(args[2] || "CLIMiner");
      console.log(`\n⛏️  Mining next block (Miner reward to: ${miner})...`);
      try {
        const writeContract = testnet.connect(signer);
        const tx = await writeContract.mineBlock(miner, tag);
        await tx.wait();
        const summary = await testnet.getChainSummary();
        console.log(`[✓] Block #${summary[2]} mined successfully!\n`);
      } catch (err) {
        console.error(`[-] Mining error: ${err.message}`);
      }
      break;
    }

    case "accounts": {
      const list = await testnet.getRegisteredAccounts();
      console.log(`\n👥 Registered Testnet Accounts (${list.length}):\n`);
      for (const addr of list) {
        const acc = await testnet.getAccount(addr);
        const isC = acc[2] ? "[CONTRACT]" : "[EOA]";
        console.log(`  ${isC.padEnd(11)} ${addr} │ Balance: ${ethers.formatEther(acc[0]).padStart(10)} SETH │ Nonce: ${acc[1]}`);
      }
      console.log("");
      break;
    }

    default:
      console.log("\nAvailable Commands:");
      console.log("  node cli.js status                  - Display testnet overview");
      console.log("  node cli.js blocks                  - List all testnet blocks");
      console.log("  node cli.js accounts                - List all registered accounts");
      console.log("  node cli.js faucet [address]        - Request 5 SETH testnet tokens");
      console.log("  node cli.js transfer [from] [to] [amount] - Send SETH transaction");
      console.log("  node cli.js mine [miner] [tag]      - Mine the next block\n");
      break;
  }
}

main().catch(console.error);

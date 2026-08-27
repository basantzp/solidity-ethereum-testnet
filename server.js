const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");

const app = express();
const PORT = process.env.PORT || 3300;
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DEPLOYMENTS_PATH = path.join(__dirname, "deployments.json");
const ARTIFACT_PATH = path.join(__dirname, "artifacts/contracts/EthereumTestnet.sol/EthereumTestnet.json");

let provider, testnetContract, adminSigner;

function getContract() {
  if (!fs.existsSync(DEPLOYMENTS_PATH) || !fs.existsSync(ARTIFACT_PATH)) {
    return null;
  }
  try {
    const dep = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf-8"));
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf-8"));
    provider = new ethers.JsonRpcProvider(RPC_URL);
    testnetContract = new ethers.Contract(dep.contracts.EthereumTestnet, artifact.abi, provider);
    return { testnetContract, dep, provider };
  } catch (e) {
    console.error("Error loading contract:", e);
    return null;
  }
}

// API: Chain Summary & Live Stats
app.get("/api/stats", async (req, res) => {
  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet not deployed yet. Run deploy script first." });

  try {
    const summary = await ctx.testnetContract.getChainSummary();
    const latest = await ctx.testnetContract.getLatestBlock();
    res.json({
      name: summary[0],
      chainId: Number(summary[1]),
      blockHeight: Number(summary[2]),
      totalTransactions: Number(summary[3]),
      totalContracts: Number(summary[4]),
      totalSupplyEth: ethers.formatEther(summary[5]),
      latestBlockHash: latest[1],
      latestMiner: latest[2],
      contractAddress: ctx.dep.contracts.EthereumTestnet,
      tokenAddress: ctx.dep.contracts.TestnetToken,
      storageAddress: ctx.dep.contracts.SimpleStorage
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Blocks List
app.get("/api/blocks", async (req, res) => {
  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet unavailable" });

  try {
    const summary = await ctx.testnetContract.getChainSummary();
    const height = Number(summary[2]);
    const blocks = [];

    for (let i = height; i >= 0; i--) {
      const b = await ctx.testnetContract.getBlock(i);
      blocks.push({
        number: Number(b[0]),
        hash: b[1],
        prevHash: b[2],
        miner: b[3],
        timestamp: Number(b[4]),
        gasUsed: Number(b[5]),
        txCount: Number(b[6])
      });
    }
    res.json(blocks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Accounts List
app.get("/api/accounts", async (req, res) => {
  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet unavailable" });

  try {
    const list = await ctx.testnetContract.getRegisteredAccounts();
    const accounts = [];
    for (const addr of list) {
      const a = await ctx.testnetContract.getAccount(addr);
      accounts.push({
        address: addr,
        balanceEth: ethers.formatEther(a[0]),
        nonce: Number(a[1]),
        isContract: a[2],
        codeHash: a[3],
        createdAtBlock: Number(a[4])
      });
    }
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Request Faucet Drip
app.post("/api/faucet", async (req, res) => {
  const { recipient } = req.body;
  if (!recipient || !ethers.isAddress(recipient)) {
    return res.status(400).json({ error: "Valid recipient Ethereum address required" });
  }

  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet unavailable" });

  try {
    // Connect with Hardhat local signer (Account #0)
    const signer = await ctx.provider.getSigner(0);
    const writeContract = ctx.testnetContract.connect(signer);
    const tx = await writeContract.requestFaucetFunds(recipient);
    await tx.wait();

    const acc = await ctx.testnetContract.getAccount(recipient);
    res.json({
      success: true,
      recipient,
      amountDripped: "5.0 SETH",
      newBalance: ethers.formatEther(acc[0]),
      txHash: tx.hash
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Mine Block
app.post("/api/mine", async (req, res) => {
  const { miner, extraData } = req.body;
  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet unavailable" });

  try {
    const signer = await ctx.provider.getSigner(0);
    const minerAddr = miner && ethers.isAddress(miner) ? miner : await signer.getAddress();
    const tag = ethers.encodeBytes32String(extraData || "WebExplorerMiner");

    const writeContract = ctx.testnetContract.connect(signer);
    const tx = await writeContract.mineBlock(minerAddr, tag);
    const receipt = await tx.wait();

    const summary = await ctx.testnetContract.getChainSummary();
    res.json({
      success: true,
      blockNumber: Number(summary[2]),
      miner: minerAddr,
      txHash: tx.hash
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Send Virtual Transaction
app.post("/api/transfer", async (req, res) => {
  const { fromIndex, to, valueEth, data } = req.body;
  if (!to || !ethers.isAddress(to)) {
    return res.status(400).json({ error: "Valid destination address required" });
  }

  const ctx = getContract();
  if (!ctx) return res.status(503).json({ error: "Testnet unavailable" });

  try {
    const signerIdx = parseInt(fromIndex || 0);
    const signer = await ctx.provider.getSigner(signerIdx);
    const writeContract = ctx.testnetContract.connect(signer);

    const valWei = ethers.parseEther(valueEth || "0");
    const payload = data && data.startsWith("0x") ? data : "0x";

    const tx = await writeContract.sendTransaction(to, valWei, payload);
    await tx.wait();

    res.json({
      success: true,
      from: await signer.getAddress(),
      to,
      valueEth: valueEth || "0",
      txHash: tx.hash
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🌐 Solidity Ethereum Testnet Explorer Active!      `);
  console.log(`  👉 URL: http://localhost:${PORT}                    `);
  console.log(`  👉 RPC: ${RPC_URL}                                 `);
  console.log(`======================================================\n`);
});

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

// In-Memory Fallback State (Ensures Explorer works seamlessly on Vercel Serverless)
let mockState = {
  name: "Solidity Ethereum Testnet (SETH)",
  chainId: 13371337,
  blockHeight: 3,
  totalTransactions: 3,
  totalContracts: 1,
  totalSupplyEth: "1000018.0",
  contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  tokenAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  storageAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  blocks: [
    {
      number: 3,
      hash: "0x2811058cccce8d3c3d03de16e74dd38812e513e121b962a8982ebb1e8f887bcf",
      prevHash: "0xecaee414c2bb99756eea087ff09d248cd8b110c19e5932196fbf1a03435c3f7c",
      miner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      timestamp: Math.floor(Date.now() / 1000) - 30,
      gasUsed: 21000,
      txCount: 1
    },
    {
      number: 2,
      hash: "0xecaee414c2bb99756eea087ff09d248cd8b110c19e5932196fbf1a03435c3f7c",
      prevHash: "0x24426903ac0cab21492a610fbe886e0f84094c3405a921df9ce314225adc0e22",
      miner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      timestamp: Math.floor(Date.now() / 1000) - 90,
      gasUsed: 21000,
      txCount: 1
    },
    {
      number: 1,
      hash: "0x24426903ac0cab21492a610fbe886e0f84094c3405a921df9ce314225adc0e22",
      prevHash: "0xc3b0cf358b2065c44b007775c1695707e3abf6cc6fe193c1dc1a4f0721467da9",
      miner: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      timestamp: Math.floor(Date.now() / 1000) - 150,
      gasUsed: 74000,
      txCount: 2
    },
    {
      number: 0,
      hash: "0xc3b0cf358b2065c44b007775c1695707e3abf6cc6fe193c1dc1a4f0721467da9",
      prevHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      miner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      timestamp: Math.floor(Date.now() / 1000) - 300,
      gasUsed: 0,
      txCount: 0
    }
  ],
  accounts: [
    { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", balanceEth: "1000000.5", nonce: 0, isContract: false },
    { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", balanceEth: "2.99", nonce: 2, isContract: false },
    { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", balanceEth: "6.50", nonce: 1, isContract: false },
    { address: "0xd0aA4D1D06F40aDbF8DA349a03468AAedE093193", balanceEth: "0.0", nonce: 0, isContract: true },
    { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", balanceEth: "6.0", nonce: 0, isContract: false }
  ]
};

function getContract() {
  if (!fs.existsSync(DEPLOYMENTS_PATH) || !fs.existsSync(ARTIFACT_PATH)) {
    return null;
  }
  try {
    const dep = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf-8"));
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf-8"));
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const testnetContract = new ethers.Contract(dep.contracts.EthereumTestnet, artifact.abi, provider);
    return { testnetContract, dep, provider };
  } catch (e) {
    return null;
  }
}

// API: Chain Summary & Live Stats
app.get("/api/stats", async (req, res) => {
  const ctx = getContract();
  if (ctx) {
    try {
      const summary = await ctx.testnetContract.getChainSummary();
      const latest = await ctx.testnetContract.getLatestBlock();
      return res.json({
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
      // Fallback to mock state
    }
  }

  // Fallback for Vercel serverless demo
  res.json(mockState);
});

// API: Blocks List
app.get("/api/blocks", async (req, res) => {
  const ctx = getContract();
  if (ctx) {
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
      return res.json(blocks);
    } catch (e) {
      // Fallback
    }
  }

  res.json(mockState.blocks);
});

// API: Accounts List
app.get("/api/accounts", async (req, res) => {
  const ctx = getContract();
  if (ctx) {
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
      return res.json(accounts);
    } catch (e) {
      // Fallback
    }
  }

  res.json(mockState.accounts);
});

// API: Request Faucet Drip
app.post("/api/faucet", async (req, res) => {
  const { recipient } = req.body;
  if (!recipient || !ethers.isAddress(recipient)) {
    return res.status(400).json({ error: "Valid recipient Ethereum address required" });
  }

  const ctx = getContract();
  if (ctx) {
    try {
      const signer = await ctx.provider.getSigner(0);
      const writeContract = ctx.testnetContract.connect(signer);
      const tx = await writeContract.requestFaucetFunds(recipient);
      await tx.wait();

      const acc = await ctx.testnetContract.getAccount(recipient);
      return res.json({
        success: true,
        recipient,
        amountDripped: "5.0 SETH",
        newBalance: ethers.formatEther(acc[0]),
        txHash: tx.hash
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Serverless mock drip
  let existing = mockState.accounts.find(a => a.address.toLowerCase() === recipient.toLowerCase());
  if (existing) {
    existing.balanceEth = (parseFloat(existing.balanceEth) + 5.0).toFixed(2);
  } else {
    mockState.accounts.push({ address: recipient, balanceEth: "5.00", nonce: 0, isContract: false });
  }

  res.json({
    success: true,
    recipient,
    amountDripped: "5.0 SETH",
    newBalance: existing ? existing.balanceEth : "5.00",
    txHash: "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("")
  });
});

// API: Mine Block
app.post("/api/mine", async (req, res) => {
  const { miner, extraData } = req.body;
  const ctx = getContract();
  if (ctx) {
    try {
      const signer = await ctx.provider.getSigner(0);
      const minerAddr = miner && ethers.isAddress(miner) ? miner : await signer.getAddress();
      const tag = ethers.encodeBytes32String(extraData || "WebExplorerMiner");

      const writeContract = ctx.testnetContract.connect(signer);
      const tx = await writeContract.mineBlock(minerAddr, tag);
      await tx.wait();

      const summary = await ctx.testnetContract.getChainSummary();
      return res.json({
        success: true,
        blockNumber: Number(summary[2]),
        miner: minerAddr,
        txHash: tx.hash
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Serverless mock mine
  const newNum = mockState.blockHeight + 1;
  mockState.blockHeight = newNum;
  const minerAddr = miner || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const newHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
  
  mockState.blocks.unshift({
    number: newNum,
    hash: newHash,
    prevHash: mockState.blocks[0].hash,
    miner: minerAddr,
    timestamp: Math.floor(Date.now() / 1000),
    gasUsed: 21000,
    txCount: 0
  });

  res.json({
    success: true,
    blockNumber: newNum,
    miner: minerAddr,
    txHash: newHash
  });
});

// API: Send Virtual Transaction
app.post("/api/transfer", async (req, res) => {
  const { fromIndex, to, valueEth, data } = req.body;
  if (!to || !ethers.isAddress(to)) {
    return res.status(400).json({ error: "Valid destination address required" });
  }

  const ctx = getContract();
  if (ctx) {
    try {
      const signerIdx = parseInt(fromIndex || 0);
      const signer = await ctx.provider.getSigner(signerIdx);
      const writeContract = ctx.testnetContract.connect(signer);

      const valWei = ethers.parseEther(valueEth || "0");
      const payload = data && data.startsWith("0x") ? data : "0x";

      const tx = await writeContract.sendTransaction(to, valWei, payload);
      await tx.wait();

      return res.json({
        success: true,
        from: await signer.getAddress(),
        to,
        valueEth: valueEth || "0",
        txHash: tx.hash
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Serverless mock transfer
  mockState.totalTransactions += 1;
  const txHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
  res.json({
    success: true,
    from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    to,
    valueEth: valueEth || "1.0",
    txHash
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🌐 Solidity Ethereum Testnet Explorer Active!      `);
    console.log(`  👉 URL: http://localhost:${PORT}                    `);
    console.log(`  👉 RPC: ${RPC_URL}                                 `);
    console.log(`======================================================\n`);
  });
}

module.exports = app;

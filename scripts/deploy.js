const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n========================================================");
  console.log("  ⚡ Deploying 100% Solidity-Native Ethereum Testnet...  ");
  console.log("========================================================\n");

  const [deployer, alice, bob, miner] = await ethers.getSigners();
  console.log("Deployer Address :", deployer.address);
  console.log("Network Name     : Hardhat Local / SETH Virtual Node");

  // 1. Deploy EthereumTestnet Core Engine
  const EthereumTestnet = await ethers.getContractFactory("EthereumTestnet");
  const testnet = await EthereumTestnet.deploy();
  await testnet.waitForDeployment();
  const testnetAddress = await testnet.getAddress();
  console.log("[✓] EthereumTestnet Core Contract Deployed at:", testnetAddress);

  // 2. Deploy Supporting Contracts (ERC-20 Token & Storage)
  const TestnetToken = await ethers.getContractFactory("TestnetToken");
  const token = await TestnetToken.deploy(1_000_000);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("[✓] Testnet USD (TUSD) Token Deployed at     :", tokenAddress);

  const SimpleStorage = await ethers.getContractFactory("SimpleStorage");
  const storage = await SimpleStorage.deploy(42, "Hello from Solidity Testnet!");
  await storage.waitForDeployment();
  const storageAddress = await storage.getAddress();
  console.log("[✓] SimpleStorage Smart Contract Deployed at :", storageAddress);

  // 3. Bootstrap Genesis State & Initial Activity
  console.log("\n[*] Bootstrapping initial testnet state & faucet drips...");
  
  // Alice & Bob request Faucet
  await (await testnet.connect(alice).requestFaucetFunds(alice.address)).wait();
  console.log(`    ├─ Faucet dripped 5 SETH to Alice (${alice.address})`);

  await (await testnet.connect(bob).requestFaucetFunds(bob.address)).wait();
  console.log(`    ├─ Faucet dripped 5 SETH to Bob   (${bob.address})`);

  // Alice sends 1.5 SETH to Bob
  const tx1 = await (await testnet.connect(alice).sendTransaction(bob.address, ethers.parseEther("1.5"), "0x")).wait();
  console.log(`    ├─ Alice transferred 1.5 SETH to Bob (Virtual Tx Recorded)`);

  // Bob deploys a virtual smart contract
  const dummyCode = "0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe";
  await (await testnet.connect(bob).sendTransaction(ethers.ZeroAddress, 0, dummyCode)).wait();
  console.log(`    ├─ Bob deployed Virtual Smart Contract`);

  // Mine Block 1
  const tag1 = ethers.encodeBytes32String("GenesisBootstrap");
  await (await testnet.connect(deployer).mineBlock(miner.address, tag1)).wait();
  console.log(`    └─ [✓] Mined Block #1 (Miner: ${miner.address})`);

  // Alice sends 0.5 SETH back to deployer & mine Block 2
  await (await testnet.connect(alice).sendTransaction(deployer.address, ethers.parseEther("0.5"), "0x")).wait();
  const tag2 = ethers.encodeBytes32String("BlockTwoProof");
  await (await testnet.connect(deployer).mineBlock(miner.address, tag2)).wait();
  console.log(`    └─ [✓] Mined Block #2`);

  // Save deployment artifact
  const deploymentInfo = {
    network: "Solidity Ethereum Testnet (SETH)",
    chainId: 13371337,
    contracts: {
      EthereumTestnet: testnetAddress,
      TestnetToken: tokenAddress,
      SimpleStorage: storageAddress
    },
    signers: {
      admin: deployer.address,
      alice: alice.address,
      bob: bob.address,
      miner: miner.address
    },
    deployedAt: new Date().toISOString()
  };

  const outPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n[✓] Deployments metadata saved to deployments.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

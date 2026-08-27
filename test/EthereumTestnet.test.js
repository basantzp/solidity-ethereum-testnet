const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Solidity Ethereum Testnet (SETH)", function () {
  let testnet, owner, alice, bob, miner;

  beforeEach(async function () {
    [owner, alice, bob, miner] = await ethers.getSigners();
    const EthereumTestnet = await ethers.getContractFactory("EthereumTestnet");
    testnet = await EthereumTestnet.deploy();
    await testnet.waitForDeployment();
  });

  it("Should initialize Genesis Block 0 with correct ChainID and Admin Balance", async function () {
    const summary = await testnet.getChainSummary();
    expect(summary.name).to.equal("Solidity Ethereum Testnet (SETH)");
    expect(summary.chainId).to.equal(13371337n);
    expect(summary.blockHeight).to.equal(0n);
    expect(summary.totalTx).to.equal(0n);

    const genesisBlock = await testnet.getBlock(0);
    expect(genesisBlock.number).to.equal(0n);
    expect(genesisBlock.miner).to.equal(owner.address);

    const adminAcc = await testnet.getAccount(owner.address);
    expect(adminAcc.balance).to.equal(ethers.parseEther("1000000"));
  });

  it("Should allow requesting funds from the testnet Faucet", async function () {
    const tx = await testnet.connect(alice).requestFaucetFunds(alice.address);
    await tx.wait();

    const aliceAcc = await testnet.getAccount(alice.address);
    expect(aliceAcc.balance).to.equal(ethers.parseEther("5"));

    // Cooldown should prevent instant second request
    await expect(
      testnet.connect(alice).requestFaucetFunds(alice.address)
    ).to.be.revertedWith("EthereumTestnet: Faucet cooldown active. Please wait 1 hour.");
  });

  it("Should execute virtual value transfers between accounts", async function () {
    // 1. Fund Alice via Faucet
    await testnet.connect(alice).requestFaucetFunds(alice.address);

    // 2. Alice sends 2 SETH to Bob
    const sendAmount = ethers.parseEther("2");
    const tx = await testnet.connect(alice).sendTransaction(bob.address, sendAmount, "0x");
    await tx.wait();

    const bobAcc = await testnet.getAccount(bob.address);
    expect(bobAcc.balance).to.equal(sendAmount);

    const summary = await testnet.getChainSummary();
    expect(summary.totalTx).to.equal(1n);
  });

  it("Should deploy virtual smart contracts on the testnet", async function () {
    // 1. Fund Alice
    await testnet.connect(alice).requestFaucetFunds(alice.address);

    // 2. Deploy contract with dummy bytecode
    const dummyBytecode = "0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe";
    const tx = await testnet.connect(alice).sendTransaction(ethers.ZeroAddress, 0, dummyBytecode);
    const receipt = await tx.wait();

    const summary = await testnet.getChainSummary();
    expect(summary.totalContracts).to.equal(1n);
  });

  it("Should mine blocks, package transactions, and pay miner subsidies", async function () {
    // 1. Faucet request + transaction
    await testnet.connect(alice).requestFaucetFunds(alice.address);
    await testnet.connect(alice).sendTransaction(bob.address, ethers.parseEther("1"), "0x");

    // 2. Mine Block 1
    const extraData = ethers.encodeBytes32String("SolidityValidator");
    const mineTx = await testnet.connect(owner).mineBlock(miner.address, extraData);
    await mineTx.wait();

    // Check block 1
    const block1 = await testnet.getBlock(1);
    expect(block1.number).to.equal(1n);
    expect(block1.miner).to.equal(miner.address);
    expect(block1.txCount).to.equal(1n);

    // Miner should receive 2 SETH block subsidy
    const minerAcc = await testnet.getAccount(miner.address);
    expect(minerAcc.balance).to.equal(ethers.parseEther("2"));

    const latest = await testnet.getLatestBlock();
    expect(latest.blockNumber).to.equal(1n);
  });
});

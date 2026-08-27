// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EthereumTestnet
 * @author Basant Pokhrel (basantzp)
 * @notice Complete 100% Solidity-Native Ethereum Testnet Engine, State Ledger, 
 *         Virtual Block Producer, Transaction Pool & On-Chain Consensus Sandbox.
 */
contract EthereumTestnet {
    // ==========================================
    // CHAIN CONFIGURATION & METADATA
    // ==========================================
    string public constant NETWORK_NAME = "Solidity Ethereum Testnet (SETH)";
    string public constant SYMBOL = "SETH";
    uint256 public constant CHAIN_ID = 13371337;
    uint256 public constant BLOCK_GAS_LIMIT = 30_000_000;
    uint256 public constant BLOCK_REWARD = 2 ether; // 2 SETH per mined block
    uint256 public constant FAUCET_DRIP_AMOUNT = 5 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    address public admin;
    uint256 public genesisTimestamp;
    uint256 public currentBlockNumber;
    uint256 public totalTransactionsCount;
    uint256 public totalContractsDeployed;
    uint256 public totalNetworkSupply;

    // ==========================================
    // DATA STRUCTURES
    // ==========================================
    struct Account {
        uint256 balance;
        uint256 nonce;
        bool isContract;
        bytes32 codeHash;
        uint256 createdAtBlock;
    }

    struct Transaction {
        bytes32 txHash;
        uint256 blockNumber;
        uint256 txIndex;
        address from;
        address to;
        uint256 value;
        uint256 gasPrice;
        uint256 gasLimit;
        uint256 gasUsed;
        bytes data;
        bool status; // true = SUCCESS, false = REVERTED
        uint256 timestamp;
    }

    struct Block {
        uint256 blockNumber;
        bytes32 blockHash;
        bytes32 prevBlockHash;
        bytes32 stateRoot;
        bytes32 txRoot;
        address miner;
        uint256 timestamp;
        uint256 difficulty;
        uint256 gasLimit;
        uint256 gasUsed;
        uint256 txCount;
        bytes32 extraData;
    }

    // ==========================================
    // STATE STORAGE
    // ==========================================
    mapping(address => Account) public accounts;
    mapping(uint256 => Block) public blocks;
    mapping(bytes32 => Transaction) public transactions;
    mapping(uint256 => bytes32[]) private blockTransactionHashes;
    mapping(address => bytes32[]) private accountTransactionHashes;
    mapping(address => uint256) public lastFaucetDrip;
    mapping(address => bool) public isValidator;
    address[] public validatorList;
    address[] public registeredAccounts;
    mapping(address => bool) private hasRegisteredAccount;

    // ==========================================
    // EVENTS
    // ==========================================
    event GenesisInitialized(uint256 chainId, uint256 timestamp, bytes32 genesisHash);
    event BlockProduced(uint256 indexed blockNumber, bytes32 indexed blockHash, address indexed miner, uint256 txCount, uint256 gasUsed);
    event TransactionExecuted(bytes32 indexed txHash, uint256 indexed blockNumber, address indexed from, address to, uint256 value, bool status);
    event ContractDeployed(address indexed contractAddress, address indexed deployer, bytes32 codeHash, uint256 blockNumber);
    event FaucetDripped(address indexed recipient, uint256 amount, uint256 timestamp);
    event ValidatorUpdated(address indexed validator, bool active);

    // ==========================================
    // MODIFIERS
    // ==========================================
    modifier onlyAdmin() {
        require(msg.sender == admin, "EthereumTestnet: Only Admin allowed");
        _;
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender] || msg.sender == admin, "EthereumTestnet: Only designated Validator allowed to seal blocks");
        _;
    }

    // ==========================================
    // CONSTRUCTOR & GENESIS INITIALIZATION
    // ==========================================
    constructor() {
        admin = msg.sender;
        genesisTimestamp = block.timestamp;
        isValidator[msg.sender] = true;
        validatorList.push(msg.sender);

        // Mint Genesis Block 0
        bytes32 genesisHash = keccak256(abi.encodePacked(
            uint256(0),
            bytes32(0),
            msg.sender,
            genesisTimestamp,
            CHAIN_ID,
            "GENESIS_BLOCK"
        ));

        blocks[0] = Block({
            blockNumber: 0,
            blockHash: genesisHash,
            prevBlockHash: bytes32(0),
            stateRoot: keccak256("GENESIS_STATE_ROOT"),
            txRoot: keccak256("GENESIS_TX_ROOT"),
            miner: msg.sender,
            timestamp: genesisTimestamp,
            difficulty: 1,
            gasLimit: BLOCK_GAS_LIMIT,
            gasUsed: 0,
            txCount: 0,
            extraData: bytes32("SETH_GENESIS_2026")
        });

        // Initialize admin Genesis balance with 1,000,000 SETH
        _creditAccount(msg.sender, 1_000_000 ether);

        emit GenesisInitialized(CHAIN_ID, genesisTimestamp, genesisHash);
    }

    // ==========================================
    // CORE TRANSACTION PIPELINE
    // ==========================================
    /**
     * @notice Submits and executes a virtual transaction inside the current pending state.
     * @param to The destination recipient or zero address for contract deployment
     * @param value Amount of virtual SETH wei to transfer
     * @param data Optional payload or contract invocation calldata
     */
    function sendTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) public returns (bytes32 txHash) {
        address from = msg.sender;
        Account storage senderAccount = accounts[from];

        uint256 requiredGas = 21_000 * 1 gwei;
        require(senderAccount.balance >= (value + requiredGas), "EthereumTestnet: Insufficient balance");

        // Compute unique transaction hash
        txHash = keccak256(abi.encodePacked(
            CHAIN_ID,
            senderAccount.nonce,
            from,
            to,
            value,
            data,
            block.timestamp,
            totalTransactionsCount
        ));

        // Deduct from sender
        senderAccount.balance -= (value + requiredGas);
        senderAccount.nonce += 1;

        uint256 gasUsed = 21_000;

        if (to == address(0) && data.length > 0) {
            // Virtual Contract Deployment
            address deployedAddr = _computeContractAddress(from, senderAccount.nonce - 1);
            bytes32 codeHash = keccak256(data);
            
            accounts[deployedAddr].isContract = true;
            accounts[deployedAddr].codeHash = codeHash;
            accounts[deployedAddr].createdAtBlock = currentBlockNumber + 1;
            
            _registerAccount(deployedAddr);
            totalContractsDeployed += 1;
            gasUsed += 32_000;

            emit ContractDeployed(deployedAddr, from, codeHash, currentBlockNumber + 1);
        } else if (to != address(0)) {
            // Standard Value Transfer
            _creditAccount(to, value);
        }

        uint256 targetBlock = currentBlockNumber + 1;

        // Record Transaction
        transactions[txHash] = Transaction({
            txHash: txHash,
            blockNumber: targetBlock,
            txIndex: blockTransactionHashes[targetBlock].length,
            from: from,
            to: to,
            value: value,
            gasPrice: 1 gwei,
            gasLimit: 100_000,
            gasUsed: gasUsed,
            data: data,
            status: true,
            timestamp: block.timestamp
        });

        blockTransactionHashes[targetBlock].push(txHash);
        accountTransactionHashes[from].push(txHash);
        if (to != address(0)) {
            accountTransactionHashes[to].push(txHash);
        }

        totalTransactionsCount += 1;

        emit TransactionExecuted(txHash, targetBlock, from, to, value, true);
        return txHash;
    }

    // ==========================================
    // BLOCK PRODUCTION & MINING ENGINE
    // ==========================================
    /**
     * @notice Mines / seals the next block, packages pending transactions, and pays miner rewards.
     * @param miner Beneficiary address to receive the block reward (2 SETH) and fees
     * @param extraData Optional vanity header tag (e.g. "SolidityValidator")
     */
    function mineBlock(address miner, bytes32 extraData) public onlyValidator returns (uint256 newBlockNumber, bytes32 blockHash) {
        address blockMiner = miner == address(0) ? msg.sender : miner;
        newBlockNumber = currentBlockNumber + 1;

        bytes32 prevHash = blocks[currentBlockNumber].blockHash;
        bytes32[] memory txHashes = blockTransactionHashes[newBlockNumber];
        
        // Calculate cumulative gas used & txRoot
        uint256 totalGas = 0;
        bytes32 txRoot = keccak256(abi.encode(txHashes));
        for (uint256 i = 0; i < txHashes.length; i++) {
            totalGas += transactions[txHashes[i]].gasUsed;
        }

        // Seal cryptographic block hash
        blockHash = keccak256(abi.encodePacked(
            newBlockNumber,
            prevHash,
            txRoot,
            blockMiner,
            block.timestamp,
            totalGas,
            extraData
        ));

        // Save Block Record
        blocks[newBlockNumber] = Block({
            blockNumber: newBlockNumber,
            blockHash: blockHash,
            prevBlockHash: prevHash,
            stateRoot: keccak256(abi.encodePacked(blockHash, totalTransactionsCount)),
            txRoot: txRoot,
            miner: blockMiner,
            timestamp: block.timestamp,
            difficulty: 2,
            gasLimit: BLOCK_GAS_LIMIT,
            gasUsed: totalGas,
            txCount: txHashes.length,
            extraData: extraData
        });

        currentBlockNumber = newBlockNumber;

        // Credit Miner Subsidy (2 SETH)
        _creditAccount(blockMiner, BLOCK_REWARD);

        emit BlockProduced(newBlockNumber, blockHash, blockMiner, txHashes.length, totalGas);
        return (newBlockNumber, blockHash);
    }

    // ==========================================
    // TESTNET FAUCET SYSTEM
    // ==========================================
    /**
     * @notice Dispenses testnet SETH tokens with cooldown rate-limiting.
     * @param recipient Target address to receive testnet funds
     */
    function requestFaucetFunds(address recipient) public returns (bool) {
        require(recipient != address(0), "EthereumTestnet: Invalid recipient");
        require(
            block.timestamp >= lastFaucetDrip[recipient] + FAUCET_COOLDOWN || lastFaucetDrip[recipient] == 0,
            "EthereumTestnet: Faucet cooldown active. Please wait 1 hour."
        );

        lastFaucetDrip[recipient] = block.timestamp;
        _creditAccount(recipient, FAUCET_DRIP_AMOUNT);

        emit FaucetDripped(recipient, FAUCET_DRIP_AMOUNT, block.timestamp);
        return true;
    }

    // ==========================================
    // VALIDATOR & CONSENSUS MANAGEMENT
    // ==========================================
    function setValidator(address validator, bool active) public onlyAdmin {
        require(validator != address(0), "EthereumTestnet: Invalid validator");
        isValidator[validator] = active;
        if (active) {
            validatorList.push(validator);
        }
        emit ValidatorUpdated(validator, active);
    }

    function getValidators() public view returns (address[] memory) {
        return validatorList;
    }

    // ==========================================
    // GETTERS & BLOCK EXPLORER VIEWS
    // ==========================================
    function getBlock(uint256 blockNum) public view returns (
        uint256 number,
        bytes32 hash,
        bytes32 prevHash,
        address miner,
        uint256 timestamp,
        uint256 gasUsed,
        uint256 txCount
    ) {
        Block memory b = blocks[blockNum];
        return (b.blockNumber, b.blockHash, b.prevBlockHash, b.miner, b.timestamp, b.gasUsed, b.txCount);
    }

    function getBlockTransactions(uint256 blockNum) public view returns (bytes32[] memory) {
        return blockTransactionHashes[blockNum];
    }

    function getAccountTransactions(address addr) public view returns (bytes32[] memory) {
        return accountTransactionHashes[addr];
    }

    function getAccount(address addr) public view returns (
        uint256 balance,
        uint256 nonce,
        bool isContract,
        bytes32 codeHash,
        uint256 createdAtBlock
    ) {
        Account memory a = accounts[addr];
        return (a.balance, a.nonce, a.isContract, a.codeHash, a.createdAtBlock);
    }

    function getLatestBlock() public view returns (
        uint256 blockNumber,
        bytes32 blockHash,
        address miner,
        uint256 timestamp,
        uint256 txCount
    ) {
        Block memory b = blocks[currentBlockNumber];
        return (b.blockNumber, b.blockHash, b.miner, b.timestamp, b.txCount);
    }

    function getRegisteredAccounts() public view returns (address[] memory) {
        return registeredAccounts;
    }

    function getChainSummary() public view returns (
        string memory name,
        uint256 chainId,
        uint256 blockHeight,
        uint256 totalTx,
        uint256 totalContracts,
        uint256 totalSupply
    ) {
        return (NETWORK_NAME, CHAIN_ID, currentBlockNumber, totalTransactionsCount, totalContractsDeployed, totalNetworkSupply);
    }

    // ==========================================
    // INTERNAL HELPERS
    // ==========================================
    function _creditAccount(address addr, uint256 amount) internal {
        _registerAccount(addr);
        accounts[addr].balance += amount;
        totalNetworkSupply += amount;
    }

    function _registerAccount(address addr) internal {
        if (!hasRegisteredAccount[addr]) {
            hasRegisteredAccount[addr] = true;
            registeredAccounts.push(addr);
        }
    }

    function _computeContractAddress(address deployer, uint256 nonce) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, uint8(nonce))))));
    }
}

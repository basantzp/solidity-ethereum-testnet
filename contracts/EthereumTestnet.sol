// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EthereumTestnet (SETH) — V2 Enhanced Protocol
 * @author Basant Pokhrel (basantzp)
 * @notice Complete 100% Solidity-Native Ethereum Testnet Engine, State Ledger, 
 *         Virtual Block Producer, EIP-1559 Elastic Fee Market, EIP-1153 Transient Reentrancy Lock,
 *         and On-Chain Consensus Sandbox on Cancun EVM.
 */
contract EthereumTestnet {
    // ==========================================
    // CHAIN CONFIGURATION & CONSTANTS
    // ==========================================
    string public constant NETWORK_NAME = "Solidity Ethereum Testnet (SETH)";
    string public constant SYMBOL = "SETH";
    uint256 public constant CHAIN_ID = 13371337;
    uint256 public constant BLOCK_GAS_LIMIT = 30_000_000;
    uint256 public constant TARGET_GAS_LIMIT = 15_000_000; // 50% target for EIP-1559
    uint256 public constant BASE_FEE_MAX_CHANGE_DENOMINATOR = 8; // 12.5% max swing per block
    uint256 public constant MIN_BASE_FEE = 1 gwei;
    uint256 public constant BLOCK_REWARD = 2 ether; // 2 SETH per mined block
    uint256 public constant FAUCET_DRIP_AMOUNT = 5 ether;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    // EIP-1153 Transient Storage Reentrancy Slot
    bytes32 private constant _REENTRANCY_SLOT = keccak256("SETH.transient.reentrancy.guard");

    address public admin;
    uint256 public genesisTimestamp;
    uint256 public currentBlockNumber;
    uint256 public totalTransactionsCount;
    uint256 public totalContractsDeployed;
    uint256 public totalNetworkSupply;
    uint256 public totalBurnedSupply;
    uint256 public baseFeePerGas;

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

    enum TxType {
        LEGACY,
        EIP1559
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
        uint256 maxPriorityFeePerGas;
        uint256 burnedFee;
        TxType txType;
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
        uint256 baseFee;
        uint256 burnedFeesInBlock;
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

    // Accumulated unmined priority fees
    uint256 public pendingPriorityTips;

    // ==========================================
    // EVENTS
    // ==========================================
    event GenesisInitialized(uint256 chainId, uint256 timestamp, bytes32 genesisHash, uint256 initialBaseFee);
    event BlockProduced(
        uint256 indexed blockNumber,
        bytes32 indexed blockHash,
        address indexed miner,
        uint256 txCount,
        uint256 gasUsed,
        uint256 baseFee,
        uint256 totalBurnedSupply
    );
    event TransactionExecuted(
        bytes32 indexed txHash,
        uint256 indexed blockNumber,
        address indexed from,
        address to,
        uint256 value,
        uint256 effectiveGasPrice,
        uint256 burnedFee,
        bool status
    );
    event ContractDeployed(address indexed contractAddress, address indexed deployer, bytes32 codeHash, uint256 blockNumber);
    event FaucetDripped(address indexed recipient, uint256 amount, uint256 timestamp);
    event ValidatorUpdated(address indexed validator, bool active);
    event BaseFeeUpdated(uint256 indexed blockNumber, uint256 oldBaseFee, uint256 newBaseFee);

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

    /// @dev EIP-1153 Transient Storage Reentrancy Guard (Cancun EVM opcode: tload / tstore)
    modifier nonReentrant() {
        bytes32 slot = _REENTRANCY_SLOT;
        uint256 locked;
        assembly {
            locked := tload(slot)
        }
        require(locked == 0, "EthereumTestnet: Reentrant call detected");
        assembly {
            tstore(slot, 1)
        }
        _;
        assembly {
            tstore(slot, 0)
        }
    }

    // ==========================================
    // CONSTRUCTOR & GENESIS INITIALIZATION
    // ==========================================
    constructor() {
        admin = msg.sender;
        genesisTimestamp = block.timestamp;
        isValidator[msg.sender] = true;
        validatorList.push(msg.sender);

        baseFeePerGas = MIN_BASE_FEE;

        // Mint Genesis Block 0
        bytes32 genesisHash = keccak256(abi.encodePacked(
            uint256(0),
            bytes32(0),
            msg.sender,
            genesisTimestamp,
            CHAIN_ID,
            "SETH_GENESIS_EIP1559"
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
            baseFee: baseFeePerGas,
            burnedFeesInBlock: 0,
            txCount: 0,
            extraData: bytes32("SETH_GENESIS_2026")
        });

        // Initialize admin Genesis balance with 1,000,000 SETH
        _mintAccount(msg.sender, 1_000_000 ether);

        emit GenesisInitialized(CHAIN_ID, genesisTimestamp, genesisHash, baseFeePerGas);
    }

    // ==========================================
    // EIP-1559 BASE FEE ALGORITHM
    // ==========================================
    /**
     * @notice Pure mathematical calculation of the next block's base fee per EIP-1559.
     * @param parentGasUsed Cumulative gas consumed in the parent block
     * @param parentBaseFee Base fee of the parent block
     */
    function calculateNextBaseFee(uint256 parentGasUsed, uint256 parentBaseFee) public pure returns (uint256 nextBaseFee) {
        if (parentGasUsed == TARGET_GAS_LIMIT) {
            return parentBaseFee;
        } else if (parentGasUsed > TARGET_GAS_LIMIT) {
            uint256 gasDelta = parentGasUsed - TARGET_GAS_LIMIT;
            uint256 feeDelta = (parentBaseFee * gasDelta) / TARGET_GAS_LIMIT / BASE_FEE_MAX_CHANGE_DENOMINATOR;
            if (feeDelta == 0) {
                feeDelta = 1;
            }
            nextBaseFee = parentBaseFee + feeDelta;
        } else {
            uint256 gasDelta = TARGET_GAS_LIMIT - parentGasUsed;
            uint256 feeDelta = (parentBaseFee * gasDelta) / TARGET_GAS_LIMIT / BASE_FEE_MAX_CHANGE_DENOMINATOR;
            if (parentBaseFee > feeDelta + MIN_BASE_FEE) {
                nextBaseFee = parentBaseFee - feeDelta;
            } else {
                nextBaseFee = MIN_BASE_FEE;
            }
        }
    }

    // ==========================================
    // TRANSACTION PIPELINE
    // ==========================================
    /**
     * @notice Submits a legacy transaction paying a static gasPrice.
     */
    function sendTransaction(
        address to,
        uint256 value,
        bytes calldata data
    ) public nonReentrant returns (bytes32 txHash) {
        return _executeTransaction(to, value, data, baseFeePerGas, 0, TxType.LEGACY);
    }

    /**
     * @notice Submits a modern EIP-1559 Type-2 transaction with maxFeePerGas and maxPriorityFeePerGas.
     * @param to Destination address or zero address for contract deployment
     * @param value Amount of virtual SETH wei to send
     * @param data Contract call payload or deployment bytecode
     * @param maxFeePerGas Maximum total fee per gas unit the sender is willing to pay
     * @param maxPriorityFeePerGas Maximum priority fee (miner tip) per gas unit
     */
    function sendEIP1559Transaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) public nonReentrant returns (bytes32 txHash) {
        require(maxFeePerGas >= baseFeePerGas, "EthereumTestnet: maxFeePerGas lower than current baseFee");
        return _executeTransaction(to, value, data, maxFeePerGas, maxPriorityFeePerGas, TxType.EIP1559);
    }

    function _executeTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        TxType txType
    ) internal returns (bytes32 txHash) {
        address from = msg.sender;
        Account storage senderAccount = accounts[from];

        uint256 effectiveGasPrice;
        uint256 priorityFeePerGas;

        if (txType == TxType.EIP1559) {
            uint256 potentialTip = maxFeePerGas - baseFeePerGas;
            priorityFeePerGas = potentialTip < maxPriorityFeePerGas ? potentialTip : maxPriorityFeePerGas;
            effectiveGasPrice = baseFeePerGas + priorityFeePerGas;
        } else {
            effectiveGasPrice = maxFeePerGas;
            priorityFeePerGas = 0;
        }

        uint256 estimatedGas = 21_000;
        if (to == address(0) && data.length > 0) {
            estimatedGas += 32_000;
        }
        uint256 maxGasLimit = 100_000;
        uint256 upfrontCost = value + (maxGasLimit * effectiveGasPrice);

        require(senderAccount.balance >= upfrontCost, "EthereumTestnet: Insufficient balance for value + max gas");

        // Compute unique deterministic transaction hash
        txHash = keccak256(abi.encodePacked(
            CHAIN_ID,
            senderAccount.nonce,
            from,
            to,
            value,
            data,
            effectiveGasPrice,
            block.timestamp,
            totalTransactionsCount
        ));

        // Deduct upfront cost & increment nonce
        senderAccount.balance -= upfrontCost;
        senderAccount.nonce += 1;

        uint256 actualGasUsed = 21_000;

        if (to == address(0) && data.length > 0) {
            address deployedAddr = _computeContractAddress(from, senderAccount.nonce - 1);
            bytes32 codeHash = keccak256(data);

            accounts[deployedAddr].isContract = true;
            accounts[deployedAddr].codeHash = codeHash;
            accounts[deployedAddr].createdAtBlock = currentBlockNumber + 1;

            _registerAccount(deployedAddr);
            totalContractsDeployed += 1;
            actualGasUsed += 32_000;

            emit ContractDeployed(deployedAddr, from, codeHash, currentBlockNumber + 1);
        } else if (to != address(0)) {
            _creditAccount(to, value);
        }

        // Refund unspent gas
        uint256 actualCost = actualGasUsed * effectiveGasPrice;
        uint256 gasRefund = (maxGasLimit - actualGasUsed) * effectiveGasPrice;
        senderAccount.balance += gasRefund;

        // Calculate Burn vs Tip
        uint256 burnedFee = actualGasUsed * baseFeePerGas;
        uint256 tipReward = actualGasUsed * priorityFeePerGas;

        if (burnedFee > 0) {
            if (totalNetworkSupply >= burnedFee) {
                totalNetworkSupply -= burnedFee;
            } else {
                totalNetworkSupply = 0;
            }
            totalBurnedSupply += burnedFee;
        }

        pendingPriorityTips += tipReward;

        uint256 targetBlock = currentBlockNumber + 1;

        transactions[txHash] = Transaction({
            txHash: txHash,
            blockNumber: targetBlock,
            txIndex: blockTransactionHashes[targetBlock].length,
            from: from,
            to: to,
            value: value,
            gasPrice: effectiveGasPrice,
            gasLimit: maxGasLimit,
            gasUsed: actualGasUsed,
            maxPriorityFeePerGas: priorityFeePerGas,
            burnedFee: burnedFee,
            txType: txType,
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

        emit TransactionExecuted(txHash, targetBlock, from, to, value, effectiveGasPrice, burnedFee, true);
        return txHash;
    }

    // ==========================================
    // BLOCK PRODUCTION & MINING ENGINE
    // ==========================================
    /**
     * @notice Seals and mines the pending block, distributes block rewards & tips, and updates EIP-1559 base fee.
     * @param miner Beneficiary address to receive the 2 SETH subsidy + tips
     * @param extraData Arbitrary metadata tag for block header
     */
    function mineBlock(address miner, bytes32 extraData) public onlyValidator returns (uint256 newBlockNumber, bytes32 blockHash) {
        address blockMiner = miner == address(0) ? msg.sender : miner;
        newBlockNumber = currentBlockNumber + 1;

        bytes32 prevHash = blocks[currentBlockNumber].blockHash;
        bytes32[] memory txHashes = blockTransactionHashes[newBlockNumber];

        uint256 totalGasUsed = 0;
        uint256 totalBurnedInBlock = 0;

        for (uint256 i = 0; i < txHashes.length; i++) {
            Transaction storage t = transactions[txHashes[i]];
            totalGasUsed += t.gasUsed;
            totalBurnedInBlock += t.burnedFee;
        }

        bytes32 txRoot = txHashes.length > 0 ? keccak256(abi.encode(txHashes)) : keccak256("EMPTY_TX_ROOT");
        bytes32 stateRoot = keccak256(abi.encodePacked(totalTransactionsCount, totalNetworkSupply, newBlockNumber));

        blockHash = keccak256(abi.encodePacked(
            newBlockNumber,
            prevHash,
            stateRoot,
            txRoot,
            blockMiner,
            block.timestamp,
            totalGasUsed,
            baseFeePerGas,
            extraData
        ));

        blocks[newBlockNumber] = Block({
            blockNumber: newBlockNumber,
            blockHash: blockHash,
            prevBlockHash: prevHash,
            stateRoot: stateRoot,
            txRoot: txRoot,
            miner: blockMiner,
            timestamp: block.timestamp,
            difficulty: 1,
            gasLimit: BLOCK_GAS_LIMIT,
            gasUsed: totalGasUsed,
            baseFee: baseFeePerGas,
            burnedFeesInBlock: totalBurnedInBlock,
            txCount: txHashes.length,
            extraData: extraData
        });

        currentBlockNumber = newBlockNumber;

        // Pay Miner block reward (2 SETH minted) + collected priority tips (transferred)
        _mintAccount(blockMiner, BLOCK_REWARD);
        if (pendingPriorityTips > 0) {
            accounts[blockMiner].balance += pendingPriorityTips;
            pendingPriorityTips = 0;
        }

        // Update EIP-1559 Base Fee for the NEXT block
        uint256 oldBaseFee = baseFeePerGas;
        baseFeePerGas = calculateNextBaseFee(totalGasUsed, oldBaseFee);

        emit BaseFeeUpdated(newBlockNumber, oldBaseFee, baseFeePerGas);
        emit BlockProduced(newBlockNumber, blockHash, blockMiner, txHashes.length, totalGasUsed, oldBaseFee, totalBurnedSupply);

        return (newBlockNumber, blockHash);
    }

    // ==========================================
    // FAUCET & ACCOUNT OPERATIONS
    // ==========================================
    function requestFaucetFunds(address recipient) public nonReentrant returns (bool) {
        require(recipient != address(0), "EthereumTestnet: Invalid recipient");
        require(
            block.timestamp >= lastFaucetDrip[recipient] + FAUCET_COOLDOWN,
            "EthereumTestnet: Faucet cooldown active. Please wait 1 hour."
        );

        lastFaucetDrip[recipient] = block.timestamp;
        _mintAccount(recipient, FAUCET_DRIP_AMOUNT);

        emit FaucetDripped(recipient, FAUCET_DRIP_AMOUNT, block.timestamp);
        return true;
    }

    function _mintAccount(address account, uint256 amount) internal {
        accounts[account].balance += amount;
        totalNetworkSupply += amount;
        _registerAccount(account);
    }

    function _creditAccount(address account, uint256 amount) internal {
        accounts[account].balance += amount;
        _registerAccount(account);
    }

    function _registerAccount(address account) internal {
        if (!hasRegisteredAccount[account]) {
            hasRegisteredAccount[account] = true;
            registeredAccounts.push(account);
        }
    }

    function _computeContractAddress(address deployer, uint256 nonce) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xd6),
            bytes1(0x94),
            deployer,
            bytes1(uint8(nonce))
        )))));
    }

    // ==========================================
    // VIEW & METRICS HELPERS
    // ==========================================
    function getChainSummary() external view returns (
        string memory name,
        uint256 chainId,
        uint256 blockHeight,
        uint256 totalTx,
        uint256 totalContracts,
        uint256 currentBaseFee,
        uint256 burnedSupply,
        uint256 circulatingSupply
    ) {
        return (
            NETWORK_NAME,
            CHAIN_ID,
            currentBlockNumber,
            totalTransactionsCount,
            totalContractsDeployed,
            baseFeePerGas,
            totalBurnedSupply,
            totalNetworkSupply
        );
    }

    function getAccount(address account) external view returns (
        uint256 balance,
        uint256 nonce,
        bool isContract,
        bytes32 codeHash,
        uint256 createdAtBlock
    ) {
        Account memory acc = accounts[account];
        return (acc.balance, acc.nonce, acc.isContract, acc.codeHash, acc.createdAtBlock);
    }

    function getBlock(uint256 blockNum) external view returns (
        uint256 number,
        bytes32 bHash,
        bytes32 prevHash,
        address miner,
        uint256 timestamp,
        uint256 gasUsed,
        uint256 baseFee,
        uint256 burnedFees,
        uint256 txCount
    ) {
        Block memory b = blocks[blockNum];
        return (b.blockNumber, b.blockHash, b.prevBlockHash, b.miner, b.timestamp, b.gasUsed, b.baseFee, b.burnedFeesInBlock, b.txCount);
    }

    function getBlockTransactions(uint256 blockNum) external view returns (bytes32[] memory) {
        return blockTransactionHashes[blockNum];
    }

    function getAccountTransactions(address account) external view returns (bytes32[] memory) {
        return accountTransactionHashes[account];
    }
}

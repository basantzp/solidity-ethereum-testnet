"""
test/test_ethereum_testnet.py - Comprehensive Test Suite for EthereumTestnet V2
Tests compilation with solc, in-memory EVM deployment with PyEVM,
EIP-1559 fee elasticity, base fee burning, transient reentrancy, and edge cases.
"""

import unittest
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from core.solidity_compiler import SolidityCompiler
from core.evm_tester import EVMTester

class TestEthereumTestnetV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compiler = SolidityCompiler()
        contract_path = BASE_DIR / "contracts" / "EthereumTestnet.sol"
        compiled = cls.compiler.compile_file(str(contract_path), evm_version="cancun")
        cls.artifact = compiled["EthereumTestnet"]
        cls.abi = cls.artifact["abi"]
        cls.bytecode = cls.artifact["bytecode"]

    def setUp(self):
        self.tester = EVMTester()
        self.contract = self.tester.deploy_contract(self.abi, self.bytecode, sender=self.tester.deployer)

    def test_01_genesis_initialization(self):
        summary = self.tester.call_view(self.contract.functions.getChainSummary())
        name, chain_id, block_height, total_tx, total_contracts, base_fee, burned, supply = summary

        self.assertEqual(name, "Solidity Ethereum Testnet (SETH)")
        self.assertEqual(chain_id, 13371337)
        self.assertEqual(block_height, 0)
        self.assertEqual(total_tx, 0)
        self.assertEqual(total_contracts, 0)
        self.assertEqual(base_fee, 1_000_000_000) # 1 gwei
        self.assertEqual(burned, 0)
        self.assertEqual(supply, 1_000_000 * 10**18)

        genesis_block = self.tester.call_view(self.contract.functions.getBlock(0))
        self.assertEqual(genesis_block[0], 0) # number
        self.assertEqual(genesis_block[3], self.tester.deployer) # miner

    def test_02_faucet_and_cooldown(self):
        # Request 5 SETH for Alice
        tx = self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)
        self.assertEqual(tx["status"], 1)

        acc = self.tester.call_view(self.contract.functions.getAccount(self.tester.alice))
        self.assertEqual(acc[0], 5 * 10**18)

        # Immediate repeat should revert with cooldown error
        reverted = self.tester.expect_revert(
            self.contract.functions.requestFaucetFunds(self.tester.alice),
            sender=self.tester.alice,
            expected_substring="Faucet cooldown active"
        )
        self.assertTrue(reverted, "Faucet must enforce 1-hour cooldown")

    def test_03_legacy_transaction(self):
        # Fund Alice
        self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)

        # Alice sends 2 SETH to Bob
        send_val = 2 * 10**18
        tx = self.tester.send_tx(self.contract.functions.sendTransaction(self.tester.bob, send_val, b""), sender=self.tester.alice)
        self.assertEqual(tx["status"], 1)

        bob_acc = self.tester.call_view(self.contract.functions.getAccount(self.tester.bob))
        self.assertEqual(bob_acc[0], send_val)

        summary = self.tester.call_view(self.contract.functions.getChainSummary())
        self.assertEqual(summary[3], 1) # totalTx

    def test_04_contract_deployment(self):
        # Fund Alice
        self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)

        # Deploy dummy contract bytecode to zero address
        dummy_code = bytes.fromhex("6080604052348015600f57600080fd5b50603f80601d6000396000f3fe")
        zero_addr = "0x0000000000000000000000000000000000000000"
        tx = self.tester.send_tx(self.contract.functions.sendTransaction(zero_addr, 0, dummy_code), sender=self.tester.alice)
        self.assertEqual(tx["status"], 1)

        summary = self.tester.call_view(self.contract.functions.getChainSummary())
        self.assertEqual(summary[4], 1) # totalContractsDeployed

    def test_05_eip1559_transaction_and_burning(self):
        # Fund Alice
        self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)

        initial_supply = self.tester.call_view(self.contract.functions.totalNetworkSupply())

        # Alice sends EIP-1559 transaction:
        # baseFee = 1 gwei, maxFee = 3 gwei, maxPriorityFee = 1 gwei
        # effectiveGasPrice = 1 gwei + 1 gwei = 2 gwei
        # burned = 21,000 * 1 gwei = 21,000,000,000,000 wei
        max_fee = 3 * 10**9
        priority_fee = 1 * 10**9
        tx = self.tester.send_tx(
            self.contract.functions.sendEIP1559Transaction(
                self.tester.bob,
                10**18,
                b"",
                max_fee,
                priority_fee
            ),
            sender=self.tester.alice
        )
        self.assertEqual(tx["status"], 1)

        new_supply = self.tester.call_view(self.contract.functions.totalNetworkSupply())
        burned_supply = self.tester.call_view(self.contract.functions.totalBurnedSupply())

        expected_burn = 21_000 * 1_000_000_000 # 21,000 gas * 1 gwei baseFee
        self.assertEqual(burned_supply, expected_burn)
        self.assertEqual(new_supply, initial_supply - expected_burn)

    def test_06_eip1559_revert_underpriced(self):
        # Fund Alice
        self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)

        # Attempt to send with maxFeePerGas < baseFeePerGas (0.5 gwei < 1.0 gwei)
        underpriced_fee = 500_000_000 # 0.5 gwei
        reverted = self.tester.expect_revert(
            self.contract.functions.sendEIP1559Transaction(
                self.tester.bob,
                10**18,
                b"",
                underpriced_fee,
                100_000_000
            ),
            sender=self.tester.alice,
            expected_substring="maxFeePerGas lower than current baseFee"
        )
        self.assertTrue(reverted, "Must reject EIP-1559 transaction with maxFee < baseFee")

    def test_07_pure_base_fee_algorithm(self):
        target_gas = 15_000_000
        parent_fee = 10_000_000_000 # 10 gwei

        # Case 1: Exact target gas -> fee does not change
        res1 = self.tester.call_view(self.contract.functions.calculateNextBaseFee(target_gas, parent_fee))
        self.assertEqual(res1, parent_fee)

        # Case 2: Maximum gas (30,000,000) -> fee increases by 12.5% (1/8th)
        max_gas = 30_000_000
        res2 = self.tester.call_view(self.contract.functions.calculateNextBaseFee(max_gas, parent_fee))
        expected_inc = parent_fee + (parent_fee // 8) # 11.25 gwei
        self.assertEqual(res2, expected_inc)

        # Case 3: Zero gas (0) -> fee decreases by 12.5%
        res3 = self.tester.call_view(self.contract.functions.calculateNextBaseFee(0, parent_fee))
        expected_dec = parent_fee - (parent_fee // 8) # 8.75 gwei
        self.assertEqual(res3, expected_dec)

        # Case 4: Clamped at minimum base fee (1 gwei)
        res4 = self.tester.call_view(self.contract.functions.calculateNextBaseFee(0, 1_000_000_000))
        self.assertEqual(res4, 1_000_000_000)

    def test_08_mining_and_payout(self):
        # Fund Alice and send transaction
        self.tester.send_tx(self.contract.functions.requestFaucetFunds(self.tester.alice), sender=self.tester.alice)
        self.tester.send_tx(
            self.contract.functions.sendEIP1559Transaction(
                self.tester.bob,
                10**18,
                b"",
                2 * 10**9,
                500_000_000 # 0.5 gwei tip
            ),
            sender=self.tester.alice
        )

        # Mine Block 1
        miner_addr = self.tester.miner
        extra_data = b"SolidityValidator".ljust(32, b"\x00")
        tx = self.tester.send_tx(self.contract.functions.mineBlock(miner_addr, extra_data), sender=self.tester.deployer)
        self.assertEqual(tx["status"], 1)

        block1 = self.tester.call_view(self.contract.functions.getBlock(1))
        self.assertEqual(block1[0], 1) # blockNumber
        self.assertEqual(block1[3], miner_addr) # miner
        self.assertEqual(block1[5], 21_000) # gasUsed
        self.assertEqual(block1[8], 1) # txCount

        # Miner should receive 2 SETH subsidy + tip (21,000 * 0.5 gwei = 10,500,000,000,000 wei)
        miner_acc = self.tester.call_view(self.contract.functions.getAccount(miner_addr))
        expected_payout = (2 * 10**18) + (21_000 * 500_000_000)
        self.assertEqual(miner_acc[0], expected_payout)

    def test_09_crypto_helpers(self):
        # EIP-55 checksum test vector
        addr = "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359"
        expected = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"
        checksummed = SolidityCompiler.compute_eip55_checksum(addr)
        self.assertEqual(checksummed, expected)

        # ERC-7201 storage namespace formula test
        slot = SolidityCompiler.compute_erc7201_storage_slot("openzeppelin.storage.ERC20")
        self.assertTrue(slot.startswith("0x"))
        self.assertEqual(len(slot), 66)
        self.assertTrue(slot.endswith("00"), "ERC-7201 slot must clear lowest byte")

if __name__ == "__main__":
    unittest.main()

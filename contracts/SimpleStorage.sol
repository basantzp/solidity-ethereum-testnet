// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SimpleStorage
 * @notice Sample smart contract deployed to test contract state mutations on the testnet.
 */
contract SimpleStorage {
    uint256 private storedData;
    string public lastMessage;
    address public owner;

    event DataUpdated(uint256 newValue, string message, address updatedBy);

    constructor(uint256 initialValue, string memory initialMsg) {
        owner = msg.sender;
        storedData = initialValue;
        lastMessage = initialMsg;
    }

    function set(uint256 x, string memory msgText) public {
        storedData = x;
        lastMessage = msgText;
        emit DataUpdated(x, msgText, msg.sender);
    }

    function get() public view returns (uint256) {
        return storedData;
    }
}

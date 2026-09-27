// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPropagationEngine {
    error NotMemorySlots(address caller);
    error InvalidMemorySlots();

    event Propagate(
        uint256 indexed from, uint256 indexed to, bytes32 indexed contentHash, string topic, uint256 timestamp
    );

    function onMemoryWritten(uint256 agentId, bytes32 contentHash, string calldata topic) external;
}

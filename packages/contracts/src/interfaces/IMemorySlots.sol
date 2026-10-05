// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMemorySlots {
    struct Slot {
        uint256 id;
        uint256 agentId;
        bytes32 contentHash;
        string topic;
        uint256 writtenAt;
    }

    error UnknownAgent(uint256 agentId);
    error UnknownSlot(uint256 slotId);
    error NotAgentWriter(uint256 agentId, address caller);
    error EmptyHash();
    error NoSlots(uint256 agentId);

    event MemoryWritten(
        uint256 indexed slotId, uint256 indexed agentId, bytes32 indexed contentHash, string topic, uint256 writtenAt
    );

    function write(uint256 agentId, bytes32 contentHash, string calldata topic) external returns (uint256 slotId);

    function slots(uint256 slotId) external view returns (Slot memory);

    function latestSlot(uint256 agentId) external view returns (Slot memory);

    function slotsSince(uint256 agentId, uint256 since) external view returns (Slot[] memory);

    function slotCount() external view returns (uint256);
}

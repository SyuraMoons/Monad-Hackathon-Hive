// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    struct Agent {
        address owner;
        string name;
        string agentType;
        bytes pubKey;
        address writer;
        uint256 registeredAt;
    }

    error NotAgentOwner(uint256 agentId, address caller);
    error UnknownAgent(uint256 agentId);
    error InvalidWriter();
    error WriterAlreadyBound(address writer, uint256 boundTo);

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, string agentType, bytes pubKey);
    event AgentWriterSet(uint256 indexed agentId, address indexed writer);

    function register(string calldata name, string calldata agentType, bytes calldata agentPubKey)
        external
        returns (uint256 agentId);

    function setAgentWriter(uint256 agentId, address writer) external;

    function agents(uint256 agentId) external view returns (Agent memory);

    function agentOf(address writer) external view returns (uint256);

    function agentExists(uint256 agentId) external view returns (bool);

    function ownerOf(uint256 agentId) external view returns (address);

    function writerOf(uint256 agentId) external view returns (address);
}

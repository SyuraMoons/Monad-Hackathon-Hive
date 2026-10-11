// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IKnowledgeGraph {
    struct Edge {
        uint256 id;
        uint256 from;
        uint256 to;
        bytes32 topic;
        uint256 expiresAt;
        bool active;
    }

    error NotAgentOwner(uint256 agentId, address caller);
    error UnknownAgent(uint256 agentId);
    error UnknownEdge(uint256 edgeId);
    error SelfEdge(uint256 agentId);
    error ExpiryInPast(uint256 expiresAt);
    error EdgeInactive(uint256 edgeId);

    event EdgeAdded(
        uint256 indexed edgeId,
        uint256 indexed from,
        uint256 indexed to,
        string topic,
        uint256 expiresAt,
        uint256 timestamp
    );
    event EdgeRemoved(uint256 indexed edgeId, address indexed by, uint256 timestamp);
    event EdgeExpiryChanged(uint256 indexed edgeId, uint256 expiresAt, uint256 timestamp);

    function addEdge(uint256 from, uint256 to, string calldata topic, uint256 expiresAt)
        external
        returns (uint256 edgeId);

    function removeEdge(uint256 edgeId) external;

    /// Moves the expiry of a live edge, earlier or later, without adding a second edge.
    function setExpiry(uint256 edgeId, uint256 expiresAt) external;

    function hasPermission(uint256 from, uint256 to, string calldata topic) external view returns (bool);

    function edgesFrom(uint256 agentId) external view returns (Edge[] memory);

    function edgesTo(uint256 agentId) external view returns (Edge[] memory);

    function edge(uint256 edgeId) external view returns (Edge memory);

    function edgeCount() external view returns (uint256);
}

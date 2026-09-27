// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IKnowledgeGraph} from "./interfaces/IKnowledgeGraph.sol";

contract KnowledgeGraph is IKnowledgeGraph {
    IAgentRegistry public immutable registry;

    uint256 private _nextEdgeId = 1;

    mapping(uint256 => Edge) private _edges;
    mapping(uint256 => uint256[]) private _fromList;
    mapping(uint256 => uint256[]) private _toList;

    constructor(IAgentRegistry registry_) {
        registry = registry_;
    }

    function addEdge(uint256 from, uint256 to, string calldata topic, uint256 expiresAt)
        external
        returns (uint256 edgeId)
    {
        if (!registry.agentExists(from)) revert UnknownAgent(from);
        if (!registry.agentExists(to)) revert UnknownAgent(to);
        if (registry.ownerOf(from) != msg.sender) revert NotAgentOwner(from, msg.sender);
        if (from == to) revert SelfEdge(from);
        if (expiresAt <= block.timestamp) revert ExpiryInPast(expiresAt);

        bytes32 topicHash = keccak256(bytes(topic));

        edgeId = _nextEdgeId++;
        _edges[edgeId] = Edge({id: edgeId, from: from, to: to, topic: topicHash, expiresAt: expiresAt, active: true});
        _fromList[from].push(edgeId);
        _toList[to].push(edgeId);

        emit EdgeAdded(edgeId, from, to, topic, expiresAt, block.timestamp);
    }

    function removeEdge(uint256 edgeId) external {
        Edge storage e = _edges[edgeId];
        if (e.id == 0) revert UnknownEdge(edgeId);
        if (registry.ownerOf(e.from) != msg.sender) revert NotAgentOwner(e.from, msg.sender);
        if (!e.active) revert EdgeInactive(edgeId);

        e.active = false;
        emit EdgeRemoved(edgeId, msg.sender, block.timestamp);
    }

    function hasPermission(uint256 from, uint256 to, string calldata topic) external view returns (bool) {
        bytes32 topicHash = keccak256(bytes(topic));
        uint256[] storage list = _fromList[from];
        for (uint256 i = 0; i < list.length; i++) {
            Edge storage e = _edges[list[i]];
            if (e.active && e.to == to && e.topic == topicHash && e.expiresAt > block.timestamp) {
                return true;
            }
        }
        return false;
    }

    function edgesFrom(uint256 agentId) external view returns (Edge[] memory) {
        return _collect(_fromList[agentId]);
    }

    function edgesTo(uint256 agentId) external view returns (Edge[] memory) {
        return _collect(_toList[agentId]);
    }

    function edge(uint256 edgeId) external view returns (Edge memory) {
        Edge memory e = _edges[edgeId];
        if (e.id == 0) revert UnknownEdge(edgeId);
        return e;
    }

    function edgeCount() external view returns (uint256) {
        return _nextEdgeId - 1;
    }

    function _collect(uint256[] storage list) private view returns (Edge[] memory out) {
        out = new Edge[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            out[i] = _edges[list[i]];
        }
    }
}

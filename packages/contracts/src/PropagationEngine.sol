// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IKnowledgeGraph} from "./interfaces/IKnowledgeGraph.sol";
import {IPropagationEngine} from "./interfaces/IPropagationEngine.sol";
import {ALL_TOPICS} from "./Topics.sol";

contract PropagationEngine is IPropagationEngine, Ownable {
    IKnowledgeGraph public immutable knowledgeGraph;
    address public memorySlots;

    constructor(IKnowledgeGraph knowledgeGraph_) Ownable(msg.sender) {
        knowledgeGraph = knowledgeGraph_;
    }

    function setMemorySlots(address memorySlots_) external onlyOwner {
        if (memorySlots_ == address(0)) revert InvalidMemorySlots();
        memorySlots = memorySlots_;
    }

    function onMemoryWritten(uint256 agentId, bytes32 contentHash, string calldata topic) external {
        if (msg.sender != memorySlots) revert NotMemorySlots(msg.sender);

        bytes32 topicHash = keccak256(bytes(topic));
        IKnowledgeGraph.Edge[] memory edges = knowledgeGraph.edgesFrom(agentId);

        for (uint256 i = 0; i < edges.length; i++) {
            IKnowledgeGraph.Edge memory edge = edges[i];
            if (edge.active && (edge.topic == topicHash || edge.topic == ALL_TOPICS) && edge.expiresAt > block.timestamp) {
                emit Propagate(agentId, edge.to, contentHash, topic, block.timestamp);
            }
        }
    }
}

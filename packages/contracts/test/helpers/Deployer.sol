// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "../../src/AgentRegistry.sol";
import {KnowledgeGraph} from "../../src/KnowledgeGraph.sol";
import {PropagationEngine} from "../../src/PropagationEngine.sol";
import {MemorySlots} from "../../src/MemorySlots.sol";

contract Deployer {
    AgentRegistry public registry;
    KnowledgeGraph public graph;
    PropagationEngine public engine;
    MemorySlots public slots;

    constructor() {
        registry = new AgentRegistry();
        graph = new KnowledgeGraph(registry);
        engine = new PropagationEngine(graph);
        slots = new MemorySlots(registry, engine);
        engine.setMemorySlots(address(slots));
    }
}

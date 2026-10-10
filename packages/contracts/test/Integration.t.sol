// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Deployer} from "./helpers/Deployer.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {KnowledgeGraph} from "../src/KnowledgeGraph.sol";
import {MemorySlots} from "../src/MemorySlots.sol";

contract IntegrationTest is Test {
    Deployer internal d;
    AgentRegistry internal registry;
    KnowledgeGraph internal graph;
    MemorySlots internal slots;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal claudeWriter = makeAddr("claudeWriter");
    address internal cursorWriter = makeAddr("cursorWriter");
    address internal therapyWriter = makeAddr("therapyWriter");

    uint256 internal claude;
    uint256 internal cursor;
    uint256 internal therapy;

    bytes32 internal constant H1 = keccak256("claude-work-1");
    bytes32 internal constant H2 = keccak256("claude-work-2");
    bytes32 internal constant H_T = keccak256("therapy-private");

    function setUp() public {
        d = new Deployer();
        registry = d.registry();
        graph = d.graph();
        slots = d.slots();

        vm.startPrank(alice);
        claude = registry.register("Claude", "assistant", bytes("pk-claude"));
        registry.setAgentWriter(claude, claudeWriter);
        vm.stopPrank();

        vm.startPrank(bob);
        cursor = registry.register("Cursor", "editor", bytes("pk-cursor"));
        registry.setAgentWriter(cursor, cursorWriter);
        therapy = registry.register("TherapyBot", "assistant", bytes("pk-therapy"));
        registry.setAgentWriter(therapy, therapyWriter);
        vm.stopPrank();
    }

    function test_DemoScenario_IsolationAndPropagation() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(claude, cursor, "work", block.timestamp + 7 days);

        vm.recordLogs();
        vm.prank(claudeWriter);
        slots.write(claude, H1, "work");
        assertEq(_countPropagate(), 1);
        assertTrue(graph.hasPermission(claude, cursor, "work"));

        vm.recordLogs();
        vm.prank(therapyWriter);
        slots.write(therapy, H_T, "private");
        assertEq(_countPropagate(), 0);

        vm.prank(alice);
        graph.removeEdge(edgeId);
        assertFalse(graph.hasPermission(claude, cursor, "work"));

        vm.recordLogs();
        vm.prank(claudeWriter);
        slots.write(claude, H2, "work");
        assertEq(_countPropagate(), 0);
    }

    function _countPropagate() internal view returns (uint256) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 propTopic = keccak256("Propagate(uint256,uint256,bytes32,string,uint256)");
        uint256 count = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == propTopic) count++;
        }
        return count;
    }
}

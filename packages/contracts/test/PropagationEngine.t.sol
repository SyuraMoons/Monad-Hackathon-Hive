// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Deployer} from "./helpers/Deployer.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {KnowledgeGraph} from "../src/KnowledgeGraph.sol";
import {MemorySlots} from "../src/MemorySlots.sol";
import {PropagationEngine} from "../src/PropagationEngine.sol";
import {IPropagationEngine} from "../src/interfaces/IPropagationEngine.sol";

contract PropagationEngineTest is Test {
    Deployer internal d;
    AgentRegistry internal registry;
    KnowledgeGraph internal graph;
    MemorySlots internal slots;
    PropagationEngine internal engine;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal writer = makeAddr("writer");
    address internal cursorWriter = makeAddr("cursorWriter");
    address internal therapyWriter = makeAddr("therapyWriter");

    uint256 internal claude;
    uint256 internal cursor;
    uint256 internal therapy;

    bytes32 internal constant HASH = keccak256("memory-1");

    function setUp() public {
        d = new Deployer();
        registry = d.registry();
        graph = d.graph();
        slots = d.slots();
        engine = d.engine();

        vm.startPrank(alice);
        claude = registry.register("Claude", "assistant", bytes("pk-c"));
        registry.setAgentWriter(claude, writer);
        vm.stopPrank();

        vm.startPrank(bob);
        cursor = registry.register("Cursor", "editor", bytes("pk-cur"));
        registry.setAgentWriter(cursor, cursorWriter);
        therapy = registry.register("TherapyBot", "assistant", bytes("pk-t"));
        registry.setAgentWriter(therapy, therapyWriter);
        vm.stopPrank();
    }

    function _future(uint256 s) internal view returns (uint256) {
        return block.timestamp + s;
    }

    function test_OnlyMemorySlotsCanCall() public {
        vm.expectRevert(abi.encodeWithSelector(IPropagationEngine.NotMemorySlots.selector, alice));
        vm.prank(alice);
        engine.onMemoryWritten(claude, HASH, "work");
    }

    function test_PropagatesToOneEdge() public {
        vm.prank(alice);
        graph.addEdge(claude, cursor, "work", _future(3600));

        vm.recordLogs();
        vm.prank(writer);
        slots.write(claude, HASH, "work");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 propTopic = keccak256("Propagate(uint256,uint256,bytes32,string,uint256)");
        uint256 count = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == propTopic) {
                count++;
                assertEq(logs[i].topics[1], bytes32(uint256(claude)));
                assertEq(logs[i].topics[2], bytes32(uint256(cursor)));
                assertEq(logs[i].topics[3], HASH);
            }
        }
        assertEq(count, 1);
    }

    function test_PropagatesToMultipleEdges_SkipsExpiredAndWrongTopic() public {
        vm.startPrank(alice);
        graph.addEdge(claude, cursor, "work", _future(3600));
        graph.addEdge(claude, cursor, "personal", _future(3600));
        graph.addEdge(claude, therapy, "work", _future(1000));
        graph.addEdge(claude, therapy, "work", _future(10));
        vm.stopPrank();

        vm.warp(vm.getBlockTimestamp() + 11);

        vm.recordLogs();
        vm.prank(writer);
        slots.write(claude, HASH, "work");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 propTopic = keccak256("Propagate(uint256,uint256,bytes32,string,uint256)");
        uint256 count = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == propTopic) count++;
        }
        assertEq(count, 2);
    }

    function test_NoPropagationForIsolatedAgent() public {
        vm.recordLogs();
        vm.prank(therapyWriter);
        slots.write(therapy, HASH, "work");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
    }

    function test_SetMemorySlots_OnlyOwner() public {
        vm.expectRevert();
        vm.prank(alice);
        engine.setMemorySlots(alice);
    }

    function test_SetMemorySlots_OwnerCanRepoint() public {
        vm.prank(address(d));
        engine.setMemorySlots(address(0xdead));
        assertEq(engine.memorySlots(), address(0xdead));
    }

    function test_SetMemorySlots_ZeroReverts() public {
        vm.prank(address(d));
        vm.expectRevert(IPropagationEngine.InvalidMemorySlots.selector);
        engine.setMemorySlots(address(0));
    }
}

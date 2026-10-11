// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {KnowledgeGraph} from "../src/KnowledgeGraph.sol";
import {IKnowledgeGraph} from "../src/interfaces/IKnowledgeGraph.sol";

contract KnowledgeGraphTest is Test {
    AgentRegistry public registry;
    KnowledgeGraph public graph;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal aliceAgent;
    uint256 internal bobAgent;
    uint256 internal therapyAgent;

    function setUp() public {
        registry = new AgentRegistry();
        graph = new KnowledgeGraph(registry);

        vm.prank(alice);
        aliceAgent = registry.register("Claude", "assistant", bytes("pk-a"));
        vm.prank(bob);
        bobAgent = registry.register("Cursor", "editor", bytes("pk-b"));
        vm.prank(bob);
        therapyAgent = registry.register("TherapyBot", "assistant", bytes("pk-t"));
    }

    function _future(uint256 secondsFromNow) internal view returns (uint256) {
        return block.timestamp + secondsFromNow;
    }

    function test_AddEdge_Works() public {
        vm.expectEmit(true, true, true, true);
        emit IKnowledgeGraph.EdgeAdded(1, aliceAgent, bobAgent, "work", _future(3600), block.timestamp);

        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        assertEq(edgeId, 1);
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));
        assertEq(graph.edgeCount(), 1);
    }

    function test_AddEdge_NonOwnerReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.NotAgentOwner.selector, aliceAgent, bob));
        vm.prank(bob);
        graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));
    }

    function test_AddEdge_UnknownAgentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.UnknownAgent.selector, 999));
        vm.prank(alice);
        graph.addEdge(999, bobAgent, "work", _future(3600));

        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.UnknownAgent.selector, 999));
        vm.prank(alice);
        graph.addEdge(aliceAgent, 999, "work", _future(3600));
    }

    function test_AddEdge_SelfEdgeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.SelfEdge.selector, aliceAgent));
        vm.prank(alice);
        graph.addEdge(aliceAgent, aliceAgent, "work", _future(3600));
    }

    function test_AddEdge_PastExpiryReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.ExpiryInPast.selector, block.timestamp));
        vm.prank(alice);
        graph.addEdge(aliceAgent, bobAgent, "work", block.timestamp);
    }

    function test_HasPermission_OnlyMatchingTopicAndDirection() public {
        vm.prank(alice);
        graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "personal"));
        assertFalse(graph.hasPermission(bobAgent, aliceAgent, "work"));
    }

    function test_HasPermission_AllTopicsEdgeCoversAnyTopic() public {
        vm.prank(alice);
        graph.addEdge(aliceAgent, bobAgent, "*", _future(3600));

        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "personal"));
        assertFalse(graph.hasPermission(bobAgent, aliceAgent, "work"));
    }

    function test_HasPermission_AllTopicsEdgeStopsWhenRevokedOrExpired() public {
        uint256 expiry = _future(1000);
        vm.startPrank(alice);
        uint256 id = graph.addEdge(aliceAgent, bobAgent, "*", expiry);
        vm.stopPrank();

        vm.warp(expiry);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));

        vm.warp(expiry - 500);
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));
        vm.prank(alice);
        graph.removeEdge(id);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_HasPermission_FalseAtExpiryBoundary() public {
        uint256 expiry = _future(1000);
        vm.prank(alice);
        graph.addEdge(aliceAgent, bobAgent, "work", expiry);

        vm.warp(expiry - 1);
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));

        vm.warp(expiry);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_RemoveEdge_RevokesPermission() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));

        vm.prank(alice);
        graph.removeEdge(edgeId);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));

        IKnowledgeGraph.Edge[] memory from = graph.edgesFrom(aliceAgent);
        assertEq(from.length, 1);
        assertFalse(from[0].active);
    }

    function test_RemoveEdge_OnlyFromOwner() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.NotAgentOwner.selector, aliceAgent, bob));
        vm.prank(bob);
        graph.removeEdge(edgeId);
    }

    function test_RemoveEdge_TwiceReverts() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        vm.startPrank(alice);
        graph.removeEdge(edgeId);
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.EdgeInactive.selector, edgeId));
        graph.removeEdge(edgeId);
        vm.stopPrank();
    }

    function test_DuplicateEdges_Independent() public {
        vm.prank(alice);
        uint256 e1 = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));
        vm.prank(alice);
        uint256 e2 = graph.addEdge(aliceAgent, bobAgent, "work", _future(7200));

        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));

        vm.prank(alice);
        graph.removeEdge(e1);
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));

        vm.prank(alice);
        graph.removeEdge(e2);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_SetExpiry_ShortensAccessWithoutAddingAnEdge() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(7200));

        vm.expectEmit(true, false, false, true);
        emit IKnowledgeGraph.EdgeExpiryChanged(edgeId, _future(60), block.timestamp);
        vm.prank(alice);
        graph.setExpiry(edgeId, _future(60));

        assertEq(graph.edge(edgeId).expiresAt, _future(60));
        assertEq(graph.edgeCount(), 1);
        assertEq(graph.edgesFrom(aliceAgent).length, 1);

        vm.warp(_future(60));
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_SetExpiry_ExtendsAccess() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(60));

        vm.prank(alice);
        graph.setExpiry(edgeId, _future(7200));

        vm.warp(_future(3600));
        assertTrue(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_SetExpiry_RevokeAfterwardsRevokesEverything() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(7200));
        vm.prank(alice);
        graph.setExpiry(edgeId, _future(3600));

        vm.prank(alice);
        graph.removeEdge(edgeId);
        assertFalse(graph.hasPermission(aliceAgent, bobAgent, "work"));
    }

    function test_SetExpiry_OnlyFromOwner() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.NotAgentOwner.selector, aliceAgent, bob));
        vm.prank(bob);
        graph.setExpiry(edgeId, _future(7200));
    }

    function test_SetExpiry_UnknownEdgeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.UnknownEdge.selector, 42));
        vm.prank(alice);
        graph.setExpiry(42, _future(3600));
    }

    function test_SetExpiry_RevokedEdgeReverts() public {
        vm.startPrank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));
        graph.removeEdge(edgeId);
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.EdgeInactive.selector, edgeId));
        graph.setExpiry(edgeId, _future(7200));
        vm.stopPrank();
    }

    function test_SetExpiry_PastExpiryReverts() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.ExpiryInPast.selector, block.timestamp));
        vm.prank(alice);
        graph.setExpiry(edgeId, block.timestamp);
    }

    function test_EdgesTo() public {
        vm.prank(alice);
        graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));
        vm.prank(bob);
        graph.addEdge(bobAgent, therapyAgent, "work", _future(3600));

        IKnowledgeGraph.Edge[] memory toBob = graph.edgesTo(bobAgent);
        assertEq(toBob.length, 1);
        assertEq(toBob[0].from, aliceAgent);

        IKnowledgeGraph.Edge[] memory toTherapy = graph.edgesTo(therapyAgent);
        assertEq(toTherapy.length, 1);
        assertEq(toTherapy[0].from, bobAgent);
    }

    function test_UnknownEdgeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IKnowledgeGraph.UnknownEdge.selector, 42));
        graph.edge(42);
    }

    function test_Edge_ReturnsValid() public {
        vm.prank(alice);
        uint256 edgeId = graph.addEdge(aliceAgent, bobAgent, "work", _future(3600));

        IKnowledgeGraph.Edge memory e = graph.edge(edgeId);
        assertEq(e.id, edgeId);
        assertEq(e.from, aliceAgent);
        assertEq(e.to, bobAgent);
        assertEq(e.topic, keccak256("work"));
        assertTrue(e.active);
    }
}


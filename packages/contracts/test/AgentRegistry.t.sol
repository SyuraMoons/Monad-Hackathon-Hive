// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal writer1 = makeAddr("writer1");
    address internal writer2 = makeAddr("writer2");

    function setUp() public {
        registry = new AgentRegistry();
    }

    function test_Register_BindsOwnerAndIncrementsIds() public {
        vm.prank(alice);
        uint256 id1 = registry.register("Claude", "assistant", bytes("pk-claude"));
        vm.prank(bob);
        uint256 id2 = registry.register("Cursor", "editor", bytes("pk-cursor"));

        assertEq(id1, 1);
        assertEq(id2, 2);

        IAgentRegistry.Agent memory a = registry.agents(1);
        assertEq(a.owner, alice);
        assertEq(a.name, "Claude");
        assertEq(a.agentType, "assistant");
        assertEq(a.pubKey, bytes("pk-claude"));
        assertEq(a.writer, address(0));
    }

    function test_Register_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.AgentRegistered(1, alice, "Claude", "assistant", bytes("pk"));

        vm.prank(alice);
        registry.register("Claude", "assistant", bytes("pk"));
    }

    function test_AgentsOf_ListsOnlyTheOwnersAgentsInOrder() public {
        vm.prank(alice);
        registry.register("Claude", "claude", bytes("pk1"));
        vm.prank(bob);
        registry.register("GPT", "gpt", bytes("pk2"));
        vm.prank(alice);
        registry.register("Claude 2", "claude", bytes("pk3"));
        vm.prank(alice);
        registry.setAgentWriter(3, writer1);

        (uint256[] memory ids, IAgentRegistry.Agent[] memory list) = registry.agentsOf(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 3);
        assertEq(list[0].name, "Claude");
        assertEq(list[1].name, "Claude 2");
        assertEq(list[1].writer, writer1);

        (ids, list) = registry.agentsOf(bob);
        assertEq(ids.length, 1);
        assertEq(list[0].owner, bob);
    }

    function test_AgentsOf_EmptyForUnknownOwner() public view {
        (uint256[] memory ids, IAgentRegistry.Agent[] memory list) = registry.agentsOf(alice);
        assertEq(ids.length, 0);
        assertEq(list.length, 0);
    }

    function test_UnknownAgent_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.UnknownAgent.selector, 999));
        registry.agents(999);

        assertFalse(registry.agentExists(999));
        assertEq(registry.ownerOf(999), address(0));
        assertEq(registry.writerOf(999), address(0));
    }

    function test_SetAgentWriter_OwnerOnly() public {
        vm.prank(alice);
        registry.register("Claude", "assistant", bytes("pk"));

        vm.prank(alice);
        registry.setAgentWriter(1, writer1);
        assertEq(registry.writerOf(1), writer1);
        assertEq(registry.agentOf(writer1), 1);

        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.NotAgentOwner.selector, 1, bob));
        vm.prank(bob);
        registry.setAgentWriter(1, writer2);
    }

    function test_SetAgentWriter_RebindMovesReverseIndex() public {
        vm.prank(alice);
        registry.register("Claude", "assistant", bytes("pk"));

        vm.startPrank(alice);
        registry.setAgentWriter(1, writer1);
        registry.setAgentWriter(1, writer2);
        vm.stopPrank();

        assertEq(registry.writerOf(1), writer2);
        assertEq(registry.agentOf(writer2), 1);
        assertEq(registry.agentOf(writer1), 0);
    }

    function test_SetAgentWriter_ZeroReverts() public {
        vm.prank(alice);
        registry.register("Claude", "assistant", bytes("pk"));

        vm.expectRevert(IAgentRegistry.InvalidWriter.selector);
        vm.prank(alice);
        registry.setAgentWriter(1, address(0));
    }

    function test_SetAgentWriter_WriterAlreadyBoundReverts() public {
        vm.prank(alice);
        registry.register("Claude", "assistant", bytes("pk"));
        vm.prank(bob);
        registry.register("Cursor", "editor", bytes("pk2"));

        vm.prank(alice);
        registry.setAgentWriter(1, writer1);

        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.WriterAlreadyBound.selector, writer1, 1));
        vm.prank(bob);
        registry.setAgentWriter(2, writer1);
    }

    function test_SetAgentWriter_UnknownAgentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.UnknownAgent.selector, 5));
        vm.prank(alice);
        registry.setAgentWriter(5, writer1);
    }
}

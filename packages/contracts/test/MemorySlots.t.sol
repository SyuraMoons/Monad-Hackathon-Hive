// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deployer} from "./helpers/Deployer.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {MemorySlots} from "../src/MemorySlots.sol";
import {IMemorySlots} from "../src/interfaces/IMemorySlots.sol";

contract MemorySlotsTest is Test {
    Deployer internal d;
    AgentRegistry internal registry;
    MemorySlots internal slots;

    address internal alice = makeAddr("alice");
    address internal writer = makeAddr("writer");
    uint256 internal agentId;

    bytes32 internal constant HASH = keccak256("memory-1");

    function setUp() public {
        d = new Deployer();
        registry = d.registry();
        slots = d.slots();

        vm.prank(alice);
        agentId = registry.register("Claude", "assistant", bytes("pk"));
        vm.prank(alice);
        registry.setAgentWriter(agentId, writer);
    }

    function test_Write_StoresSlot() public {
        vm.prank(writer);
        uint256 slotId = slots.write(agentId, HASH, "work");

        assertEq(slotId, 1);
        IMemorySlots.Slot memory s = slots.slots(1);
        assertEq(s.agentId, agentId);
        assertEq(s.contentHash, HASH);
        assertEq(s.topic, "work");
    }

    function test_Write_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit IMemorySlots.MemoryWritten(1, agentId, HASH, "work", block.timestamp);

        vm.prank(writer);
        slots.write(agentId, HASH, "work");
    }

    function test_Write_UnauthorizedWriterReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IMemorySlots.NotAgentWriter.selector, agentId, alice));
        vm.prank(alice);
        slots.write(agentId, HASH, "work");
    }

    function test_Write_UnknownAgentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IMemorySlots.UnknownAgent.selector, 999));
        vm.prank(writer);
        slots.write(999, HASH, "work");
    }

    function test_Write_EmptyHashReverts() public {
        vm.expectRevert(IMemorySlots.EmptyHash.selector);
        vm.prank(writer);
        slots.write(agentId, bytes32(0), "work");
    }

    function test_LatestSlot() public {
        vm.startPrank(writer);
        slots.write(agentId, HASH, "work");
        slots.write(agentId, keccak256("memory-2"), "personal");
        vm.stopPrank();

        IMemorySlots.Slot memory latest = slots.latestSlot(agentId);
        assertEq(latest.contentHash, keccak256("memory-2"));
        assertEq(latest.topic, "personal");
    }

    function test_SlotsSince() public {
        vm.startPrank(writer);
        slots.write(agentId, HASH, "work");
        vm.warp(vm.getBlockTimestamp() + 100);
        slots.write(agentId, keccak256("memory-2"), "work");
        vm.stopPrank();

        IMemorySlots.Slot[] memory all = slots.slotsSince(agentId, 0);
        assertEq(all.length, 2);

        IMemorySlots.Slot[] memory sinceLater = slots.slotsSince(agentId, block.timestamp - 50);
        assertEq(sinceLater.length, 1);
        assertEq(sinceLater[0].contentHash, keccak256("memory-2"));
    }

    function test_SlotCount() public {
        vm.startPrank(writer);
        slots.write(agentId, HASH, "work");
        slots.write(agentId, keccak256("memory-2"), "work");
        vm.stopPrank();

        assertEq(slots.slotCount(), 2);
    }

    function test_LatestSlot_NoSlotsReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IMemorySlots.NoSlots.selector, agentId));
        slots.latestSlot(agentId);
    }

    function test_SlotsSince_NoSlots() public {
        IMemorySlots.Slot[] memory none = slots.slotsSince(agentId, 0);
        assertEq(none.length, 0);
    }
}

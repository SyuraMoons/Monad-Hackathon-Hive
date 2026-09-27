// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IMemorySlots} from "./interfaces/IMemorySlots.sol";
import {IPropagationEngine} from "./interfaces/IPropagationEngine.sol";

contract MemorySlots is IMemorySlots {
    IAgentRegistry public immutable registry;
    IPropagationEngine public immutable engine;

    uint256 private _nextSlotId = 1;

    mapping(uint256 => Slot) private _slots;
    mapping(uint256 => uint256[]) private _slotsByAgent;

    constructor(IAgentRegistry registry_, IPropagationEngine engine_) {
        registry = registry_;
        engine = engine_;
    }

    function write(uint256 agentId, bytes32 contentHash, string calldata topic) external returns (uint256 slotId) {
        if (!registry.agentExists(agentId)) revert UnknownAgent(agentId);
        if (msg.sender != registry.writerOf(agentId)) revert NotAgentWriter(agentId, msg.sender);
        if (contentHash == bytes32(0)) revert EmptyHash();

        slotId = _nextSlotId++;
        _slots[slotId] =
            Slot({id: slotId, agentId: agentId, contentHash: contentHash, topic: topic, writtenAt: block.timestamp});
        _slotsByAgent[agentId].push(slotId);

        emit MemoryWritten(slotId, agentId, contentHash, topic, block.timestamp);

        engine.onMemoryWritten(agentId, contentHash, topic);
    }

    function slots(uint256 slotId) external view returns (Slot memory) {
        Slot memory s = _slots[slotId];
        if (s.id == 0) revert UnknownSlot(slotId);
        return s;
    }

    function latestSlot(uint256 agentId) external view returns (Slot memory) {
        uint256[] storage list = _slotsByAgent[agentId];
        if (list.length == 0) revert NoSlots(agentId);
        return _slots[list[list.length - 1]];
    }

    function slotsSince(uint256 agentId, uint256 since) external view returns (Slot[] memory) {
        uint256[] storage list = _slotsByAgent[agentId];
        uint256 count = 0;
        for (uint256 i = 0; i < list.length; i++) {
            if (_slots[list[i]].writtenAt >= since) count++;
        }
        Slot[] memory out = new Slot[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < list.length; i++) {
            Slot memory s = _slots[list[i]];
            if (s.writtenAt >= since) out[j++] = s;
        }
        return out;
    }

    function slotCount() external view returns (uint256) {
        return _nextSlotId - 1;
    }
}

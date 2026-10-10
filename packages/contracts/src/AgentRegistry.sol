// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

contract AgentRegistry is IAgentRegistry {
    uint256 private _nextAgentId = 1;

    mapping(uint256 => Agent) private _agents;
    mapping(address => uint256) private _agentByWriter;
    mapping(address => uint256[]) private _agentsByOwner;

    function register(string calldata name, string calldata agentType, bytes calldata agentPubKey)
        external
        returns (uint256 agentId)
    {
        agentId = _nextAgentId++;
        _agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            agentType: agentType,
            pubKey: agentPubKey,
            writer: address(0),
            registeredAt: block.timestamp
        });
        _agentsByOwner[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, name, agentType, agentPubKey);
    }

    function setAgentWriter(uint256 agentId, address writer) external {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert UnknownAgent(agentId);
        if (agent.owner != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        if (writer == address(0)) revert InvalidWriter();

        uint256 boundTo = _agentByWriter[writer];
        if (boundTo != 0 && boundTo != agentId) revert WriterAlreadyBound(writer, boundTo);

        address previous = agent.writer;
        if (previous != address(0) && previous != writer) {
            delete _agentByWriter[previous];
        }
        agent.writer = writer;
        _agentByWriter[writer] = agentId;

        emit AgentWriterSet(agentId, writer);
    }

    function agents(uint256 agentId) external view returns (Agent memory) {
        Agent memory agent = _agents[agentId];
        if (agent.owner == address(0)) revert UnknownAgent(agentId);
        return agent;
    }

    function agentOf(address writer) external view returns (uint256) {
        return _agentByWriter[writer];
    }

    function agentsOf(address owner) external view returns (uint256[] memory ids, Agent[] memory list) {
        ids = _agentsByOwner[owner];
        list = new Agent[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _agents[ids[i]];
        }
    }

    function agentExists(uint256 agentId) external view returns (bool) {
        return _agents[agentId].owner != address(0);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].owner;
    }

    function writerOf(uint256 agentId) external view returns (address) {
        return _agents[agentId].writer;
    }
}

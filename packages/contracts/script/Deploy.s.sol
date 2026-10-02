// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {KnowledgeGraph} from "../src/KnowledgeGraph.sol";
import {PropagationEngine} from "../src/PropagationEngine.sol";
import {MemorySlots} from "../src/MemorySlots.sol";

/// @dev Deploys the Hive permission layer and records addresses to
///      deployments/monad-testnet.json.
///
///      DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Fail fast: a dry deployer otherwise dies on forge's 4-retry gas error.
        console2.log("Deployer:", deployer);
        console2.log("Balance (wei):", deployer.balance);
        if (deployer.balance == 0) {
            revert("Deployer has 0 MON; claim from https://faucet.monad.xyz first.");
        }

        vm.startBroadcast(deployerPrivateKey);

        AgentRegistry registry = new AgentRegistry();
        KnowledgeGraph graph = new KnowledgeGraph(registry);
        PropagationEngine engine = new PropagationEngine(graph);
        MemorySlots slots = new MemorySlots(registry, engine);
        engine.setMemorySlots(address(slots));

        vm.stopBroadcast();

        string memory obj = "hive";
        string memory json = vm.serializeAddress(obj, "agentRegistry", address(registry));
        json = vm.serializeAddress(obj, "knowledgeGraph", address(graph));
        json = vm.serializeAddress(obj, "propagationEngine", address(engine));
        json = vm.serializeAddress(obj, "memorySlots", address(slots));
        json = vm.serializeUint(obj, "chainId", block.chainid);
        vm.writeJson(json, "./deployments/monad-testnet.json");

        console2.log("AgentRegistry      :", address(registry));
        console2.log("KnowledgeGraph     :", address(graph));
        console2.log("PropagationEngine  :", address(engine));
        console2.log("MemorySlots        :", address(slots));
        console2.log("Wrote deployments/monad-testnet.json");
    }
}

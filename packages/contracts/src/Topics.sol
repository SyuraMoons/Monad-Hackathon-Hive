// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev An edge whose topic is "*" releases every topic (ADR-013). Same string as `ALL_TOPICS` in `@hive/shared`.
bytes32 constant ALL_TOPICS = keccak256("*");

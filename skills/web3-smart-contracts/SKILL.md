---
name: web3-smart-contracts
description: Design, implement, audit, and deploy secure Solidity smart contracts and dApp frontends with Viem/Wagmi
tools: [listDir, readFile, writeFile, editFile, runTerminal]
---
# Web3 & Smart Contract Engineering Mastery Skill

## Core Philosophy: Immutability, Zero Vulnerabilities, Gas Efficiency
Smart contract code is immutable once deployed. Financial value is at stake. Code must be mathematically sound, verified against all known attack vectors, and optimized for minimal gas consumption.

---

## 1. Zero-Stub & Security Mandate
- **NEVER deploy unverified or untested smart contracts.**
- **Strict Security Rules**:
  1. **Checks-Effects-Interactions**: Always perform input validations first (`require`/custom errors), update contract internal state next, and only then interact with external contracts or transfer Ether.
  2. **Reentrancy Protection**: Use OpenZeppelin's `ReentrancyGuard` and apply `nonReentrant` to all external/public functions transferring tokens or native currency.
  3. **Custom Errors over Revert Strings**: Use custom errors (`error InsufficientBalance(uint256 available, uint256 required);`) instead of string reverts to save deployment and execution gas.
  4. **Access Control**: Explicitly enforce role-based access control (`Ownable2Step`, `AccessControlDefaultAdminRules`). Never use `tx.origin` for authorization; use `msg.sender`.
  5. **Integer Overflow & Underflow**: Enforce Solidity 0.8+ checked arithmetic. Use `unchecked` blocks only where mathematical impossibility of overflow is proven.

---

## 2. Standard Contract Architecture (Solidity 0.8.20+)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

error InvalidAmount();
error TransferFailed();

contract Vault is Ownable2Step, ReentrancyGuard {
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0 || balances[msg.sender] < amount) revert InvalidAmount();
        balances[msg.sender] -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }
}
```

---

## 3. Frontend dApp Integration (Viem & Wagmi)
- Type-Safe ABIs: Generate human-readable ABIs using Wagmi CLI or `as const` assertions.
- Wallet Connectors: Support MetaMask, Coinbase Wallet, WalletConnect v2 via RainbowKit or AppKit.
- Transaction Feedback: Display pending transaction hashes, explorer links (Etherscan), and toast notifications for confirmations.

---

## 4. Production Verification Checklist
1. Unit Tests: 100% branch and line coverage with Foundry (`forge test -vvv`) or Hardhat.
2. Gas Optimization: Run `forge snapshot` to benchmark gas per transaction.
3. Slither / Static Analysis: Run Slither static analyzer to ensure zero high/medium severity findings.

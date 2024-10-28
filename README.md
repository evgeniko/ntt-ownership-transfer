# Solana Squad NTT Management Scripts

This repository contains scripts for managing a Solana Native Token Transfer (NTT) program using Squads multisig functionality.

## Prerequisites

- Solana web3.js
- Anchor framework
- Squads SDK (@sqds/multisig)
- Wormhole NTT SDK

## Files Overview

### 1. `createSquad.ts`
This script creates a new Squads multisig instance on Solana's devnet.
Sets up member permissions and threshold requirements.


### 2. `transferOwnership.ts`
Handles the transfer of NTT program ownership to a Squads vault on devnet.

**Key Features:**
- Transfers ownership to a temporary account
- Creates and executes a transaction proposal through Squads
- Claims ownership using the Squads vault

### 3. `transferOwnershipMainnet.ts`
Handles the transfer of NTT program ownership to a Squads vault on mainnet in addition to the Squads UI.

### 4. `managageLimits.ts`
Manages NTT program parameters through Squads multisig.

**Key Features:**
- Sets inbound and outbound rate limits for token transfers
- Implements pause/unpause functionality
- Creates and executes Squads proposals for parameter changes

## Configuration

Each script requires:
- A wallet keypair JSON file
- Specific program IDs and addresses
- Connection to Solana devnet

## Important Notes

1. Update the following TODOs in each script:
   - Wallet paths
   - NTT manager addresses
   - Squads public keys

2. Transaction signing:
   - Multiple squad members may need to sign based on threshold
   - Proper permissions must be set for transaction execution

import * as multisig from "@sqds/multisig";
const { Permission, Permissions } = multisig.types;
import { Connection, Keypair } from "@solana/web3.js";
const fs = require('fs');

(async () => {
    const connection = new Connection("https://api.devnet.solana.com");

    // Random Public Key that will be used to derive a multisig PDA
    // This will need to be a signer on the transaction
    const createKey = Keypair.generate();
    // Creator should be a Keypair or a Wallet Adapter wallet
    const walletPath = "./WpyVik9YdWs8jnFoLnRBxfGfgQKgSxfEs5MYfTRwLCY.json";
    const walletJSON = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    const creator = Keypair.fromSecretKey(Uint8Array.from(walletJSON));
    
    // Derive the multisig PDA
    const [multisigPda] = multisig.getMultisigPda({
        createKey: createKey.publicKey,
    });
    
    const signature = await multisig.rpc.multisigCreate({
        connection: connection,
        creator: creator, 
        // Must sign the transaction, unless the .rpc method is used.
        createKey: createKey,
        // The PDA of the multisig you are creating, derived by a random PublicKey
        multisigPda,
        // Here the config authority will be the system program
        configAuthority: null,
        // Create without any time-lock
        timeLock: 0,
        // List of the members to add to the multisig
        members: [{
                // Members Public Key
                key: creator.publicKey,
                // Granted Proposer, Voter, and Executor permissions
                permissions: Permissions.all(),
            }
        ],
        // This means that there needs to be 2 votes for a transaction proposal to be approved
        threshold: 1,
    });
    
    console.log("Multisig created: ", signature)
})();

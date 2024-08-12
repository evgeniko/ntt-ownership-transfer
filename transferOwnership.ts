import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json"; 
const fs = require('fs');

(async () => {
  try {
    const walletPath = "./wa6f7GdNNkX4MysZtkv4hCUE6bN3XmkKTudQp44bB3T.json"
    const walletJSON = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

    const programId = "nTTa5qGXavkrvh2FDYA24yBDdUiiy7DCWxQYjyxLj9r";
    const programIdKey =  new PublicKey("nTTa5qGXavkrvh2FDYA24yBDdUiiy7DCWxQYjyxLj9r");

    const [configPublicKey, _configPublicKeyBump] = await PublicKey.findProgramAddress(
        [Buffer.from("config")],
        programIdKey
      );
    const newOwnerPublicKey = new PublicKey("WnJiAWvmw5hafLVnCspTa1F1Wt35uwgyvMTJb5n18xJ");
    // temporary pda, needed before claim instruction
    const [upgradeLockPublicKey, _upgradeLockPublicKey] = await PublicKey.findProgramAddress(
        [Buffer.from("upgrade_lock")],
        programIdKey
      );
    //   The programDataPublicKey is the PDA that stores the program's data
    const bpfLoaderUpgradeableProgramPublicKey = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const [programDataPublicKey, _programDataBump] = await PublicKey.findProgramAddress(
    [programIdKey.toBuffer()],
    bpfLoaderUpgradeableProgramPublicKey 
    );

    const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
    anchor.setProvider(provider);

    const program = new anchor.Program(idl as anchor.Idl, programId, provider);
    await program.methods
      .transferOwnership()
      .accounts({
        config: configPublicKey,
        owner: wallet.publicKey,
        newOwner: newOwnerPublicKey,
        upgradeLock: upgradeLockPublicKey,
        programData: programDataPublicKey,
        bpfLoaderUpgradeableProgram: bpfLoaderUpgradeableProgramPublicKey,
      })
      .signers([wallet.payer])
      .rpc();

    console.log("Ownership transfer completed successfully.");
  } catch (error) {
    console.error("Error during ownership transfer:", error);
  }
})();

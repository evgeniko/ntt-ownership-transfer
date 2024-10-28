import * as anchor from "@project-serum/anchor";
import { Connection as solanaConnection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import idl from "./idl.json"; 
import * as multisig from "@sqds/multisig";
const fs = require('fs');

(async () => {
    // TODO: needs to be token owner & creator of the Squads multisig
    const tokenOwnerWalletPath = "ww4AoktpBksE1M4zk6vWxujbqtaqhGY59VMuAxV4yxq.json";
    const walletJSON = JSON.parse(fs.readFileSync(tokenOwnerWalletPath, "utf-8"));
    const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

    // TODO: change to your NTT manager address
    const nttManagerProgramId = "ntTPvQLdTaMUXNX1LBbAvbz9i2GyH3KwB8Q3NFDZhzK";
    const nttManagerProgramIdKey =  new PublicKey(nttManagerProgramId);

    const solanaCon = new solanaConnection("https://api.devnet.solana.com");

    const [configPublicKey, _configPublicKeyBump] = await PublicKey.findProgramAddress(
        [Buffer.from("config")],
        nttManagerProgramIdKey
      );

    // claiming ownership from temporary account with squads sdk!
    // TODO: change to your squads pubkey
    const squadsAddress = new PublicKey("squri3LHQffRXoy3ZFbNCWg2Ck38jzcNXNQJQQJzPEa");
    // Derive the PDA of the Squads Vault
    // this is going to be the Upgrade authority address, which is controlled by the Squad!
    const [vaultPda] = multisig.getVaultPda({
      multisigPda: squadsAddress,
        index: 0,
    });
    console.log(vaultPda);
    // temporary pda, needed before claim instruction
    const [upgradeLockPublicKey, _upgradeLockPublicKey] = await PublicKey.findProgramAddress(
        [Buffer.from("upgrade_lock")],
        nttManagerProgramIdKey
      );
    //   The programDataPublicKey is the PDA that stores the program's data
    const bpfLoaderUpgradeableProgramPublicKey = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const [programDataPublicKey, _programDataBump] = await PublicKey.findProgramAddress(
    [nttManagerProgramIdKey.toBuffer()],
    bpfLoaderUpgradeableProgramPublicKey 
    );

    const anchorConnection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(anchorConnection, wallet, { preflightCommitment: "confirmed" });
    anchor.setProvider(provider);

    const program = new anchor.Program(idl as anchor.Idl, nttManagerProgramId, provider);
    // delegate ownership to a temporary account!
    await program.methods
      .transferOwnership()
      .accounts({
        config: configPublicKey,
        owner: wallet.publicKey,
        newOwner: vaultPda,
        upgradeLock: upgradeLockPublicKey,
        programData: programDataPublicKey,
        bpfLoaderUpgradeableProgram: bpfLoaderUpgradeableProgramPublicKey,
      })
      .signers([wallet.payer]).rpc();

    // this needs to be someone who has permissions to sign transactions for the squad!
    const squadMember = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));
    
    // Get deserialized multisig account info
    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      solanaCon,
      squadsAddress
    );

    // Get the updated transaction index
    const currentTransactionIndex = Number(multisigInfo.transactionIndex);
    const newTransactionIndex = BigInt(currentTransactionIndex + 1);
        
    // this transaction gets wrapped and send to the vault of the squads to be signed there
    const instructionClaim = await program.methods
      .claimOwnership()
      .accounts({
        config: configPublicKey,
        upgradeLock: upgradeLockPublicKey,
        newOwner: vaultPda,
        programData: programDataPublicKey,
        bpfLoaderUpgradeableProgram: bpfLoaderUpgradeableProgramPublicKey,
      }).instruction();
    
    // Build a message with instructions we want to execute
    const testClaimMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
        instructions: [instructionClaim],
    });
    
    const uploadTransactionIx = await multisig.instructions.vaultTransactionCreate({
        multisigPda: squadsAddress,
        // every squad has a global counter for transactions
        transactionIndex: newTransactionIndex,
        creator: squadMember.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 0,
        transactionMessage: testClaimMessage,
    });

    // proposal is squad specific!
    const createProposalIx = multisig.instructions.proposalCreate({
      multisigPda: squadsAddress,
      transactionIndex: newTransactionIndex,
      creator: squadMember.publicKey
    });

    /*
      ONLY DEVNET VERSION
      transferOwnershipMainnet.ts can be used with Squads UI for Mainnet!!
    */

    // proposalApprove method needs to be executed for every member of the squad!
    // only needed for testing purposes, if on devnet. 
    // Squads UI is only available on mainnet, which can be used instead!
    const createApproveIx = multisig.instructions.proposalApprove({
      multisigPda: squadsAddress,
      transactionIndex: newTransactionIndex,
      member: squadMember.publicKey 
    });

    const finalTxMessage = new TransactionMessage({
        payerKey: squadMember.publicKey,
        recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
        instructions: [uploadTransactionIx, createProposalIx, createApproveIx],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(finalTxMessage);
    // needs to be signed by as many squads members to reach threshold, 
    // for that we also execute the proposalApprove method
    transaction.sign([squadMember]);
    const signature = await solanaCon.sendTransaction(transaction);
    await solanaCon.confirmTransaction(signature);


  const executeClaimIx = await multisig.instructions.vaultTransactionExecute({
    connection: solanaCon,
    multisigPda: squadsAddress,
    transactionIndex: newTransactionIndex,  
    member: squadMember.publicKey
  });

  const executeFinalTx = new TransactionMessage({
      payerKey: squadMember.publicKey,
      recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
      instructions: [executeClaimIx.instruction],
  }).compileToV0Message(executeClaimIx.lookupTableAccounts);

  const transactionFinal = new VersionedTransaction(executeFinalTx);
  // needs to be signed by as many squads members to reach threshold, 
  // for that we also execute the proposalApprove method
  transactionFinal.sign([squadMember]);
  const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
  await solanaCon.confirmTransaction(signatureFinal);

  console.log("Ownership transfer on devnet completed successfully.");
})();

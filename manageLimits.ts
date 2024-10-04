import * as anchor from "@project-serum/anchor";
import { Connection as solanaConnection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import idl from "./idl.json";
import * as multisig from "@sqds/multisig";
const fs = require('fs');

(async () => {
    const walletPath = "/WpyVik9YdWs8jnFoLnRBxfGfgQKgSxfEs5MYfTRwLCY.json";
    const walletJSON = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    const walletKeypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));

    const programId = "nt5qvUo98jeiYSW8opSJt7F3e8XnSX1xXt4qKmCrvgd";
    const programIdKey = new PublicKey(programId);

    const solanaCon = new solanaConnection("https://api.devnet.solana.com");

    const [configPublicKey, _] = await PublicKey.findProgramAddress(
        [Buffer.from("config")],
        programIdKey
    );

    const squadsAddress = new PublicKey("5xy4cJ7dWjZ1zqfePVCxGA8mgpsYW54G3Be4UHfmyVCF");
    const [vaultPda] = multisig.getVaultPda({
        multisigPda: squadsAddress,
        index: 0,
    });
    console.log(vaultPda);

    const anchorConnection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(anchorConnection, wallet, { preflightCommitment: "confirmed" });
    anchor.setProvider(provider);

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

    const program = new anchor.Program(idl as anchor.Idl, programId, provider);
    const [outboundLimitPublicKey] = await PublicKey.findProgramAddress(
        [Buffer.from("outbox_rate_limit")],
        programIdKey
    );

    const outboundLimitInstruction = await program.methods
        .setOutboundLimit({ limit: new anchor.BN(1000.005) })
        .accounts({
            config: configPublicKey,
            owner: vaultPda,
            rateLimit: outboundLimitPublicKey,
        })
        .instruction();


    const [inboundrateLimitPublicKey] = await PublicKey.findProgramAddress(
        [Buffer.from("inbox_rate_limit")],
        programIdKey
    );
    // List of ChainIds: https://github.com/wormhole-foundation/wormhole-sdk-ts/blob/fa4ba4bc349a7caada809f209090d79a3c5962fe/core/base/src/constants/chains.ts#L6
    const inboundLimitInstruction = await program.methods
        .setInboundLimit({ limit: new anchor.BN(1000.005), chain_id: 1 })
        .accounts({
            config: configPublicKey,
            owner: vaultPda,
            rateLimit: inboundrateLimitPublicKey,
        })
        .instruction();

    const pauseInstruction = await program.methods
    .setPaused(true)
    .accounts({
        config: configPublicKey,
        owner: vaultPda,
    })
    .instruction();

    // Build a message with instructions we want to execute
    const testClaimMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
        //TODO: modify this based on the instruction you want to perform (outboundLimitInstruction / inboundLimitInstruction or pauseInstruction)
        instructions: [pauseInstruction],
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

    const txMessage = new TransactionMessage({
        payerKey: squadMember.publicKey,
        recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
        instructions: [uploadTransactionIx, createProposalIx, createApproveIx],
    }).compileToV0Message();
    
      const transaction = new VersionedTransaction(txMessage);
      // needs to be signed by as many squads members to reach threshold, 
      // for that we also execute the proposalApprove method
      transaction.sign([squadMember]);
      const signature = await solanaCon.sendTransaction(transaction);

      await solanaCon.confirmTransaction(signature);
    
      console.log(signature);
      console.log("Squad proposal created and approved.");

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
      console.log(signatureFinal);
      await solanaCon.confirmTransaction(signatureFinal);

    console.log("Adjusting rate limits or paused the contract successfully.");
})();

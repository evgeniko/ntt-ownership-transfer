import * as anchor from "@project-serum/anchor";
import { Connection as solanaConnection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import idl from "./idl.json";
import * as multisig from "@sqds/multisig";
const fs = require('fs');

(async () => {
    // Setup code (reused from the original script)
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

    const anchorConnection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
    const wallet = new anchor.Wallet(walletKeypair);
    const provider = new anchor.AnchorProvider(anchorConnection, wallet, { preflightCommitment: "confirmed" });
    anchor.setProvider(provider);

    const program = new anchor.Program(idl as anchor.Idl, programId, provider);

    // Function to create and send a transaction through the multisig
    async function sendMultisigTransaction(instruction: anchor.web3.TransactionInstruction) {
        const squadMember = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(walletJSON));
        
        const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(solanaCon, squadsAddress);
        const currentTransactionIndex = Number(multisigInfo.transactionIndex);
        const newTransactionIndex = BigInt(currentTransactionIndex + 1);
        
        const transactionMessage = new TransactionMessage({
            payerKey: vaultPda,
            recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
            instructions: [instruction],
        });
        
        const uploadTransactionIx = await multisig.instructions.vaultTransactionCreate({
            multisigPda: squadsAddress,
            transactionIndex: newTransactionIndex,
            creator: squadMember.publicKey,
            vaultIndex: 0,
            ephemeralSigners: 0,
            transactionMessage: transactionMessage,
        });

        const createProposalIx = multisig.instructions.proposalCreate({
            multisigPda: squadsAddress,
            transactionIndex: newTransactionIndex,
            creator: squadMember.publicKey
        });

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
        transaction.sign([squadMember]);
        const signature = await solanaCon.sendTransaction(transaction);
        await solanaCon.confirmTransaction(signature);

        const executeIx = await multisig.instructions.vaultTransactionExecute({
            connection: solanaCon,
            multisigPda: squadsAddress,
            transactionIndex: newTransactionIndex,  
            member: squadMember.publicKey
        });

        const executeFinalTx = new TransactionMessage({
            payerKey: squadMember.publicKey,
            recentBlockhash: (await solanaCon.getLatestBlockhash()).blockhash,
            instructions: [executeIx.instruction],
        }).compileToV0Message(executeIx.lookupTableAccounts);

        const transactionFinal = new VersionedTransaction(executeFinalTx);
        transactionFinal.sign([squadMember]);
        const signatureFinal = await solanaCon.sendTransaction(transactionFinal);
        await solanaCon.confirmTransaction(signatureFinal);
    }

    // Function to set outbound limit
    async function setOutboundLimit(args: any) {
        const [rateLimitPublicKey] = await PublicKey.findProgramAddress(
            [Buffer.from("outbox_rate_limit")],
            programIdKey
        );

        const instruction = await program.methods
            .setOutboundLimit(args)
            .accounts({
                config: configPublicKey,
                owner: vaultPda,
                rateLimit: rateLimitPublicKey,
            })
            .instruction();

        await sendMultisigTransaction(instruction);
        console.log("Outbound limit set successfully.");
    }

    // Function to set inbound limit
    async function setInboundLimit(args: any) {
        const [rateLimitPublicKey] = await PublicKey.findProgramAddress(
            [Buffer.from("inbox_rate_limit")],
            programIdKey
        );

        const instruction = await program.methods
            .setInboundLimit(args)
            .accounts({
                config: configPublicKey,
                owner: vaultPda,
                rateLimit: rateLimitPublicKey,
            })
            .instruction();

        await sendMultisigTransaction(instruction);
        console.log("Inbound limit set successfully.");
    }

    // Function to set paused state
    async function setPaused(pause: boolean) {
        const instruction = await program.methods
            .setPaused(pause)
            .accounts({
                owner: vaultPda,
                config: configPublicKey,
            })
            .instruction();

        await sendMultisigTransaction(instruction);
        console.log(`Contract ${pause ? 'paused' : 'unpaused'} successfully.`);
    }

    // TODO: comment out any methods, that are not needed
    await setOutboundLimit({ limit: 1000000 }); 
    await setInboundLimit({
        limit: 1000000, 
        chain_id: ChainId.Solana 
    });
    await setPaused(true); 
})();

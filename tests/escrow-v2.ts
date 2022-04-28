import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { EscrowV2 } from "../target/types/escrow_v2";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import { NodeWallet } from "./utils/nodewallet";
import * as TS from '../src/generated';
import { Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

describe("escrow-v2", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.EscrowV2 as Program<EscrowV2>;

  let makerMint: spl.Token;
  let takerMint: spl.Token;
  let randomOtherMint: spl.Token;
  let makerTokenAccountA: anchor.web3.PublicKey;
  let makerTokenAccountB: anchor.web3.PublicKey;
  let takerTokenAccountB: anchor.web3.PublicKey;
  let takerTokenAccountA: anchor.web3.PublicKey;
  let offerTakersRandomOtherTokens: anchor.web3.PublicKey;
  let hackersTakerTokens: anchor.web3.PublicKey;

  const maker = anchor.web3.Keypair.generate();
  const taker = anchor.web3.Keypair.generate();
  const hacker = anchor.web3.Keypair.generate();

  async function initilize(initAccounts: TS.InitializeInstructionAccounts, initArgs: TS.InitializeInstructionArgs, signers: anchor.web3.Signer[]){
    const initializeIx = TS.createInitializeInstruction(initAccounts, initArgs);
    const initializeTx = new Transaction().add(initializeIx);
    await sendAndConfirmTransaction(
      program.provider.connection,
      initializeTx,
      signers,
    );
  }

  function get_escrow_seeds(amount_a, amount_b) {
    const seeds =
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("escrow")),
        amount_a.toBuffer("le", 8),
        amount_b.toBuffer("le", 8),
        maker.publicKey.toBuffer(),
      ];
    return seeds;
  }

  function get_vault_seeds(escrow) {
    const seeds =
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("vault")), 
        escrow.toBuffer()
      ];
    return seeds;
  }

  before(async () => {
    const wallet = provider.wallet as NodeWallet;
    makerMint = await spl.Token.createMint(
      program.provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      0,
      spl.TOKEN_PROGRAM_ID
    );
    takerMint = await spl.Token.createMint(
      program.provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      0,
      spl.TOKEN_PROGRAM_ID
    );
    randomOtherMint = await spl.Token.createMint(
      program.provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      0,
      spl.TOKEN_PROGRAM_ID
    );
    makerTokenAccountA = await makerMint.createAssociatedTokenAccount(
      maker.publicKey
    );
    makerTokenAccountB = await takerMint.createAssociatedTokenAccount(
      maker.publicKey
    );
    takerTokenAccountA = await makerMint.createAssociatedTokenAccount(
      taker.publicKey
    );
    takerTokenAccountB = await takerMint.createAssociatedTokenAccount(
      taker.publicKey
    );
    offerTakersRandomOtherTokens =
      await randomOtherMint.createAssociatedTokenAccount(taker.publicKey);
    hackersTakerTokens = await takerMint.createAssociatedTokenAccount(
      hacker.publicKey
    );

    await makerMint.mintTo(
      makerTokenAccountA,
      provider.wallet.publicKey,
      [],
      1000
    );
    await takerMint.mintTo(
      takerTokenAccountB,
      provider.wallet.publicKey,
      [],
      1000
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(maker.publicKey, 10000000000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(taker.publicKey, 10000000000),
      "confirmed"
    );
  });

  it("send to vault", async () => {
    let amount_a = new anchor.BN(100);
    let amount_b = new anchor.BN(200);

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_escrow_seeds(amount_a, amount_b),
      program.programId
    );

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_vault_seeds(escrow),
      program.programId
    );

    const accounts: TS.InitializeInstructionAccounts = {
      escrow: escrow,
      vault: vault,
      authority: maker.publicKey,
      tokenAccountMaker: makerTokenAccountA,
      mintTokenMaker: makerMint.publicKey,
      mintTokenTaker: takerMint.publicKey,
    }
    const args: TS.InitializeInstructionArgs = {
      amountA: amount_a,
      amountB: amount_b
    }
    const signers: anchor.web3.Signer[] = [maker];

    await initilize(accounts, args, signers);
    
    await (await program.account.escrow.fetch(escrow)).vecU8;
    // Checks vault PDA Account
    assert.equal(
      100,
      (await makerMint.getAccountInfo(vault)).amount.toNumber()
    );

    // Checks escrow Account
    let escrowArgs: TS.EscrowArgs = {
      authority: maker.publicKey,
      mintTokenMaker: makerMint.publicKey,
      mintTokenTaker: takerMint.publicKey,
      amountA: amount_a,
      amountB: amount_b,
      escrowBump: escrowBump, 
      vaultBump: vaultBump,
    }
    let expectedEscrow = TS.Escrow.fromArgs(escrowArgs);
    let actualEscrow = TS.Escrow.deserialize(await (await program.provider.connection.getAccountInfo(escrow)).data)[0];
    assert.equal(
      JSON.stringify(actualEscrow),
      JSON.stringify(expectedEscrow)
    );

  });

  it("send to vault and cancel", async () => {
    let amount_a = new anchor.BN(50);
    let amount_b = new anchor.BN(200);

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_escrow_seeds(amount_a, amount_b),
      program.programId
    );

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_vault_seeds(escrow),
      program.programId
    );

    const startingTokenBalance = (
      await makerMint.getAccountInfo(makerTokenAccountA)
    ).amount.toNumber();

    await program.methods
      .initialize(
        amount_a,
        amount_b,
      )
        .accounts({
          escrow: escrow,
          vault: vault,
          authority: maker.publicKey,
          tokenAccountMaker: makerTokenAccountA,
          mintTokenMaker: makerMint.publicKey,
          mintTokenTaker: takerMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
          .signers([maker])
            .rpc();
    
    // Check the escrow has the right amount.
    assert.equal(
      50,
      (await makerMint.getAccountInfo(vault)).amount.toNumber()
    );

    await program.methods
    .cancel()
      .accounts({
        escrow: escrow,
        vault: vault,
        authority: maker.publicKey,
        tokenAccountMaker: makerTokenAccountA,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      })
      .signers([maker])
      .rpc();
      
    // The underlying escrow account got closed when the offer got cancelled.
    assert.equal(
      null,
      await program.provider.connection.getAccountInfo(escrow)
    );
    // The vault account got closed when the offer got cancelled.
    assert.equal(null, await program.provider.connection.getAccountInfo(vault));

    // The offer maker got their tokens back.
    assert.equal(
      startingTokenBalance,
      (await makerMint.getAccountInfo(makerTokenAccountA)).amount.toNumber()
    );

    // See what happens if we accept despite already canceling...
    try {
      await program.methods
        .exchange()
          .accounts({
            escrow: escrow,
            vault: vault,
            maker: provider.wallet.publicKey,
            authority: taker.publicKey,
            tokenAccountMakerB: makerTokenAccountB,
            tokenAccountTakerB: takerTokenAccountB,
            tokenAccountTakerA: takerTokenAccountA,
            takerMint: takerMint.publicKey,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
          })
            .signers([taker])
              .rpc();
    } catch (e) {
      // The offer account got closed when we accepted the offer, so trying to
      // use it again results in "not owned by the program" error (as expected).
      // assert.equal(3012, e.error.errorCode.number);
      // console.log(e);
    }
  });

  it("send to vault and exchange", async () => {
    let amount_a = new anchor.BN(150);
    let amount_b = new anchor.BN(200);

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_escrow_seeds(amount_a, amount_b),
      program.programId
    );

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_vault_seeds(escrow),
      program.programId
    );

    const startingTokenBalance = (
      await makerMint.getAccountInfo(takerTokenAccountA)
    ).amount.toNumber();

    await program.methods
      .initialize(
        amount_a,
        amount_b,
      )
        .accounts({
          escrow: escrow,
          vault: vault,
          authority: maker.publicKey,
          tokenAccountMaker: makerTokenAccountA,
          mintTokenMaker: makerMint.publicKey,
          mintTokenTaker: takerMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
          .signers([maker])
            .rpc();

    // Check the escrow has the right amount.
    assert.equal(
      amount_a.toNumber(),
      (await makerMint.getAccountInfo(vault)).amount.toNumber()
    );
    try{
      await program.methods
      .exchange()
        .accounts({
          escrow: escrow,
          vault: vault,
          maker: maker.publicKey,
          authority: taker.publicKey,
          tokenAccountMakerB: makerTokenAccountB,
          tokenAccountTakerB: takerTokenAccountB,
          tokenAccountTakerA: takerTokenAccountA,
          takerMint: takerMint.publicKey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
          .signers([taker])
            .rpc();
      }
      catch(e){
        console.log(e)
      }

    // The underlying escrow account got closed when the offer got cancelled.
    assert.equal(
      null,
      await program.provider.connection.getAccountInfo(escrow)
    );
    // The vault account got closed when the offer got cancelled.
    assert.equal(null, await program.provider.connection.getAccountInfo(vault));

    // The offer taker got their tokens.
    assert.equal(
      amount_a.toNumber(),
      (await makerMint.getAccountInfo(takerTokenAccountA)).amount.toNumber()
    );
  });

  it("Error: exchange with the wrong kind of tokens", async () => {
    let amount_a = new anchor.BN(30);
    let amount_b = new anchor.BN(200);

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_escrow_seeds(amount_a, amount_b),
      program.programId
    );

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_vault_seeds(escrow),
      program.programId
    );

    await program.methods
      .initialize(
        amount_a,
        amount_b,
      )
        .accounts({
          escrow: escrow,
          vault: vault,
          authority: maker.publicKey,
          tokenAccountMaker: makerTokenAccountA,
          mintTokenMaker: makerMint.publicKey,
          mintTokenTaker: takerMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
          .signers([maker])
            .rpc();

    // Check the escrow has the right amount.
    assert.equal(
      30,
      (await makerMint.getAccountInfo(vault)).amount.toNumber()
    );

    try {
      await program.methods
      .exchange()
        .accounts({
          escrow: escrow,
          vault: vault,
          maker: maker.publicKey,
          authority: taker.publicKey,
          tokenAccountMakerB: makerTokenAccountB,
          tokenAccountTakerB: takerTokenAccountB,
          tokenAccountTakerA: offerTakersRandomOtherTokens,
          takerMint: takerMint.publicKey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
          .signers([taker])
            .rpc();
    } catch (e) {
      // Should trigger a constraint
      assert.equal(2003, e.error.errorCode.number);
      assert.equal('token_account_taker_a', e.error.origin);
    }

    // The underlying offer account got closed when the offer got cancelled.
    assert.notEqual(
      null,
      await program.provider.connection.getAccountInfo(escrow)
    );
    // The escrow account got closed when the offer got accepted.
    assert.notEqual(
      null,
      await program.provider.connection.getAccountInfo(vault)
    );
  });

  it("Error: won't let you accept an offer with a token account that doesn't belong to the maker", async () => {
    let amount_a = new anchor.BN(70);
    let amount_b = new anchor.BN(200);

    const [escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_escrow_seeds(amount_a, amount_b),
      program.programId
    );

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      get_vault_seeds(escrow),
      program.programId
    );

    await program.methods
      .initialize(
        amount_a,
        amount_b,
      )
        .accounts({
          escrow: escrow,
          vault: vault,
          authority: maker.publicKey,
          tokenAccountMaker: makerTokenAccountA,
          mintTokenMaker: makerMint.publicKey,
          mintTokenTaker: takerMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
          .signers([maker])
            .rpc();

    // Check the escrow has the right amount.
    assert.equal(
      70,
      (await makerMint.getAccountInfo(vault)).amount.toNumber()
    );

    try {
      await program.methods
      .exchange()
        .accounts({
          escrow: escrow,
          vault: vault,
          maker: maker.publicKey,
          authority: taker.publicKey,
          tokenAccountMakerB: makerTokenAccountB,
          tokenAccountTakerB: takerTokenAccountB,
          tokenAccountTakerA: offerTakersRandomOtherTokens,
          takerMint: takerMint.publicKey,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        })
          .signers([taker])
            .rpc();
    } catch (e) {
      // Should trigger an associated token constraint
      assert.equal(2003, e.error.errorCode.number);
      assert.equal('token_account_taker_a', e.error.origin);
    }

    // The underlying offer account got closed when the offer got cancelled.
    assert.notEqual(
      null,
      await program.provider.connection.getAccountInfo(escrow)
    );
    // The escrow account got closed when the offer got accepted.
    assert.notEqual(
      null,
      await program.provider.connection.getAccountInfo(vault)
    );
  });
});


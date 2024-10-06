import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CounterSession } from "../target/types/counter_session";
import { SessionTokenManager } from "@magicblock-labs/gum-sdk";
import { assert } from "chai";

describe("counter_session", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.CounterSession as Program<CounterSession>;

  const topUp = async (wallet: anchor.web3.Keypair) => {
    const res = await provider.connection.requestAirdrop(wallet.publicKey, 1e9);
    await provider.connection.confirmTransaction(res, "confirmed");
  };

  const sessionManager = new SessionTokenManager(
    // @ts-ignore
    provider.wallet,
    provider.connection,
    "devnet"
  );

  const createCounterPDA = (userPubKey: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddressSync( 
      [ Buffer.from("counter"), userPubKey.toBuffer() ], 
      program.programId 
    )[0];
  };

  const createCounter = async (payer: anchor.web3.Keypair) => {
    const counterPDA = createCounterPDA(payer.publicKey);
    await program.methods
      .initialize()
      .accounts({
        counter: counterPDA,
        owner: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const counter = await program.account.counter.fetch(counterPDA);
    return [counter, counterPDA] as const;
  };

  const createSessionSigner = async (wallet) => {
    const sessionSigner = anchor.web3.Keypair.generate();
    const keys = await sessionManager.program.methods
      .createSession(true, null)
      .accounts({
        sessionSigner: sessionSigner.publicKey,
        authority: wallet.publicKey,
        targetProgram: program.programId,
      })
      .signers([sessionSigner, wallet])
      .rpcAndKeys();
    
    const sessionToken = keys.pubkeys.sessionToken as anchor.web3.PublicKey;
    return { sessionSigner, sessionToken };
  };

  const increment = async (
    counterPDA,
    user: anchor.web3.Keypair
  ) => {
    await program.methods
      .increment()
      .accounts({
        systemProgram: anchor.web3.SystemProgram.programId,
        counter: counterPDA,
        signer: user.publicKey,
        sessionToken: null,
      })
      .signers([user])
      .rpc();
  
    return counterPDA;
  };
  


  const increment_with_session = async (
    counterPDA,
    sessionSigner: anchor.web3.Keypair,
    sessionToken: anchor.web3.PublicKey
  ) => {
    await program.methods
      .increment()
      .accounts({
        systemProgram: anchor.web3.SystemProgram.programId,
        counter: counterPDA,
        signer: sessionSigner.publicKey,
        sessionToken,
      })
      .signers([sessionSigner])
      .rpc();
  
    return counterPDA;
  };
  


  it("Is initialized!", async () => {
    const user = anchor.web3.Keypair.generate();
    await topUp(user);
      
    const [counterData] = await createCounter(user);
    console.log("Counter initialized with value: ", counterData.count);

    assert(counterData.count.eq(new anchor.BN(0)));
  });

  it("it increments without session token", async () => {
    const user = anchor.web3.Keypair.generate();
    await topUp(user);
  
    let counterPDA = await createCounterPDA(user.publicKey);    
    await createCounter(user);

    await increment(counterPDA, user);

    const counterData = await program.account.counter.fetch(counterPDA);
    assert(counterData.count.eq(new anchor.BN(1)));
  });

  it("it increments using session token", async () => {
    const user = anchor.web3.Keypair.generate();
    await topUp(user);
  
    let counterPDA = await createCounterPDA(user.publicKey);    
    await createCounter(user);

    const { sessionSigner, sessionToken } = await createSessionSigner(user);    
    await increment_with_session(counterPDA, sessionSigner, sessionToken);

    const counterData = await program.account.counter.fetch(counterPDA);
    assert(counterData.count.eq(new anchor.BN(1)));
  });

  it("it fails to increment without wrong session token owner", async () => {
    const user = anchor.web3.Keypair.generate();
    await topUp(user);
  
    let counterPDA = await createCounterPDA(user.publicKey);    
    await createCounter(user);

    const secondUser = anchor.web3.Keypair.generate();
    await topUp(secondUser);
    const { sessionSigner, sessionToken } = await createSessionSigner(secondUser);    
    
    try {
      await increment_with_session(counterPDA, sessionSigner, sessionToken);
      assert(false, "Expected to fail");
      
    } catch (err) {}

    const counterData = await program.account.counter.fetch(counterPDA);
    assert(counterData.count.eq(new anchor.BN(0)));
  });
});

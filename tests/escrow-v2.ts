import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { EscrowV2 } from "../target/types/escrow_v2";

describe("escrow-v2", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.EscrowV2 as Program<EscrowV2>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});

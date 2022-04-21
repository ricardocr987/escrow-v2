import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

interface Wallet {
    signTransaction(tx: Transaction): Promise<Transaction>;
    signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
    publicKey: PublicKey;
}
  
export class NodeWallet implements Wallet {
    constructor(readonly payer: Keypair) {}
  
    static local(): NodeWallet {
      const process = require("process");
      const payer = Keypair.fromSecretKey(
        Buffer.from(
          JSON.parse(
            require("fs").readFileSync(process.env.ANCHOR_WALLET, {
              encoding: "utf-8",
            })
          )
        )
      );
      return new NodeWallet(payer);
    }
  
    async signTransaction(tx: Transaction): Promise<Transaction> {
      tx.partialSign(this.payer);
      return tx;
    }
  
    async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
      return txs.map((t) => {
        t.partialSign(this.payer);
        return t;
      });
    }
  
    get publicKey(): PublicKey {
      return this.payer.publicKey;
    }
}
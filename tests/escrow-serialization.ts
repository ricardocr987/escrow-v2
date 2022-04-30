import {Keypair} from "@solana/web3.js"

import {Escrow, EscrowArgs} from "../src/generated"
import BN from "bn.js"

const args: EscrowArgs = {
  authority: Keypair.generate().publicKey,
  mintTokenMaker: Keypair.generate().publicKey,
  mintTokenTaker: Keypair.generate().publicKey,
  amountA: new BN(100),
  amountB: new BN(200),
  escrowBump: 1,
  vaultBump: 2,
  vecU8: Buffer.from('hello world'),
  vecU16: [4,5, 6],
}
const escrow = Escrow.fromArgs(args)
const [buf] = escrow.serialize()
console.log(buf.toJSON().data.join(','))
const [deserialized] = Escrow.deserialize(buf, 0)
console.log(deserialized)
console.log(Buffer.from(deserialized.vecU8).toString('utf8'))

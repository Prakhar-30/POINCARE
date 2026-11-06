import { getAddress, type Address } from "viem";

/** Every address the SDK needs for one Poincaré deployment. */
export type PoincareDeployment = {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  poolManager: Address;
  hook: Address;
  lens: Address;
  /** Canonical Uniswap v4 router the app and the DCA contract trade through. */
  router: Address;
  /** currency0 */
  usdc: Address;
  /** currency1 */
  weth: Address;
  /** The PoincareDCA periphery; undefined on a chain where it is not deployed. */
  dca?: Address;
  deployBlock: bigint;
  dcaDeployBlock?: bigint;
};

/** Both pool tokens are 18-decimal on the testnet deployment. */
export const TOKEN_DECIMALS = 18;

/** The live testnet pool (deployments/unichain-sepolia.json). */
export const UNICHAIN_SEPOLIA: PoincareDeployment = {
  chainId: 1301,
  name: "Unichain Sepolia",
  rpcUrl: "https://sepolia.unichain.org",
  explorer: "https://sepolia.uniscan.xyz",
  poolManager: getAddress("0x00B036B58a818B1BC34d502D3fE730Db729e62AC"),
  hook: getAddress("0x89A520e7faEd35CB6F89b0040F5Bc5ADe035Aa88"),
  lens: getAddress("0xe685a9e01a46f6ff581ffbd6b409e1cef4ab2fa2"),
  router: getAddress("0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba"),
  usdc: getAddress("0x1b4034D6C443Eff3D2e9051A08147eF9eD8EBc70"),
  weth: getAddress("0x26b5D554c8118F247d5FA8a469Ff3a3d3084A449"),
  deployBlock: 66190311n,
  /** deployments/unichain-sepolia-dca.json */
  dca: getAddress("0x412C6d6a8566A013b2a3552BBE2a1beEF89fE78A"),
  dcaDeployBlock: 67077212n,
};

/** A deployment with the DCA periphery address filled in (e.g. from unichain-sepolia-dca.json). */
export function withDca(dep: PoincareDeployment, dca: Address, dcaDeployBlock?: bigint): PoincareDeployment {
  return { ...dep, dca: getAddress(dca), dcaDeployBlock };
}

export class DcaNotDeployedError extends Error {
  constructor(chain: string) {
    super(`PoincareDCA is not deployed on ${chain} yet: pass its address with withDca(deployment, address).`);
    this.name = "DcaNotDeployedError";
  }
}

export function requireDca(dep: PoincareDeployment): Address {
  if (!dep.dca) throw new DcaNotDeployedError(dep.name);
  return dep.dca;
}

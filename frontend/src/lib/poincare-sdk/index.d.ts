// Generated from packages/sdk (pnpm --dir packages/sdk sync:frontend). Do not edit by hand.
import * as viem from 'viem';
import { Address, PublicClient, Hex, Hash, TransactionReceipt, WalletClient, Account, Chain } from 'viem';
import { Hex as Hex$1 } from '../../types/misc.js';
import { Prettify } from '../../types/utils.js';
import { ValidateSiweMessageParameters } from '../../utils/siwe/validateSiweMessage.js';
import { VerifyHashParameters } from '../public/verifyHash.js';
import { Hex as Hex$2 } from '../types/misc.js';

declare const hookAbi: readonly [{
    readonly type: "function";
    readonly name: "adaptive";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "currentFeeWad";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "cusumState";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "sPos";
        readonly type: "int256";
        readonly internalType: "int256";
    }, {
        readonly name: "sNeg";
        readonly type: "int256";
        readonly internalType: "int256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "dFloor";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "dMax";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "directionalEfficiency";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "effectiveSpread";
    readonly inputs: readonly [{
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "k";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "int256";
        readonly internalType: "int256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "kappa";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "kappaMax";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "kappaMin";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lambda";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lastSampledBlock";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lastSampledPriceWad";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "poolKey";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "tuple";
        readonly internalType: "struct PoolKey";
        readonly components: readonly [{
            readonly name: "currency0";
            readonly type: "address";
            readonly internalType: "Currency";
        }, {
            readonly name: "currency1";
            readonly type: "address";
            readonly internalType: "Currency";
        }, {
            readonly name: "fee";
            readonly type: "uint24";
            readonly internalType: "uint24";
        }, {
            readonly name: "tickSpacing";
            readonly type: "int24";
            readonly internalType: "int24";
        }, {
            readonly name: "hooks";
            readonly type: "address";
            readonly internalType: "contract IHooks";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "previewDetector";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "s";
        readonly type: "tuple";
        readonly internalType: "struct PoincareHook.DetectorSnap";
        readonly components: readonly [{
            readonly name: "advanced";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "hasReturn";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "priceWad";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "r";
            readonly type: "int256";
            readonly internalType: "int256";
        }, {
            readonly name: "sPos";
            readonly type: "int256";
            readonly internalType: "int256";
        }, {
            readonly name: "sNeg";
            readonly type: "int256";
            readonly internalType: "int256";
        }, {
            readonly name: "ewmaNet";
            readonly type: "int256";
            readonly internalType: "int256";
        }, {
            readonly name: "ewmaTV";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "d";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "sigma";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "kappa";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "trend";
            readonly type: "uint8";
            readonly internalType: "enum Cusum.Trend";
        }, {
            readonly name: "offsetA";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "offsetB";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "mid";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "previewSpread";
    readonly inputs: readonly [{
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly outputs: readonly [{
        readonly name: "spreadWad";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "feeWad";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "reserves";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "r0";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "r1";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "sMax";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "int256";
        readonly internalType: "int256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "sigmaWad";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "thresholdH";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "int256";
        readonly internalType: "int256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "trend";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint8";
        readonly internalType: "enum Cusum.Trend";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "event";
    readonly name: "DetectorSample";
    readonly inputs: readonly [{
        readonly name: "blockNumber";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "priceWad";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "r";
        readonly type: "int256";
        readonly indexed: false;
        readonly internalType: "int256";
    }, {
        readonly name: "sPos";
        readonly type: "int256";
        readonly indexed: false;
        readonly internalType: "int256";
    }, {
        readonly name: "sNeg";
        readonly type: "int256";
        readonly indexed: false;
        readonly internalType: "int256";
    }, {
        readonly name: "dWad";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "sigmaWad";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "kappaWad";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "trend";
        readonly type: "uint8";
        readonly indexed: false;
        readonly internalType: "enum Cusum.Trend";
    }, {
        readonly name: "feeWad";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}];

declare const lensAbi: readonly [{
    readonly type: "function";
    readonly name: "effectivePriceWad";
    readonly inputs: readonly [{
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly internalType: "bool";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "hook";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract PoincareHook";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "midPriceWad";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "quoteExactInput";
    readonly inputs: readonly [{
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly internalType: "bool";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "quoteExactOutput";
    readonly inputs: readonly [{
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly internalType: "bool";
    }, {
        readonly name: "amountOut";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "amountIn";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "snapshot";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "reserve0";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "reserve1";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "kappa";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "trend";
        readonly type: "uint8";
        readonly internalType: "enum Cusum.Trend";
    }, {
        readonly name: "directionalEfficiency";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "sPos";
        readonly type: "int256";
        readonly internalType: "int256";
    }, {
        readonly name: "sNeg";
        readonly type: "int256";
        readonly internalType: "int256";
    }, {
        readonly name: "thresholdH";
        readonly type: "int256";
        readonly internalType: "int256";
    }, {
        readonly name: "sigmaWad";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "baseFeeWad";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "spreads";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "spreadZeroForOne";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "spreadOneForZero";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}];

declare const dcaAbi: readonly [{
    readonly type: "function";
    readonly name: "MAX_SLICES";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint32";
        readonly internalType: "uint32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "MIN_INTERVAL";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint32";
        readonly internalType: "uint32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "acceptOwnership";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "canExecute";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "tuple";
        readonly internalType: "struct PoincareDCA.Preview";
        readonly components: readonly [{
            readonly name: "status";
            readonly type: "uint8";
            readonly internalType: "enum PoincareDCA.Status";
        }, {
            readonly name: "amountIn";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "quoteOut";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "minOut";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "spreadBps";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "slot";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "nextSlotAt";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "cancel";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "refunded";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "closeExpired";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "refunded";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "createOrder";
    readonly inputs: readonly [{
        readonly name: "p";
        readonly type: "tuple";
        readonly internalType: "struct PoincareDCA.OrderParams";
        readonly components: readonly [{
            readonly name: "zeroForOne";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "amountIn";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "slices";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "interval";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "startTime";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "deadline";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "maxSpreadBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "pauseOnTrend";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "catchUp";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "maxSlippageBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "minPriceWad";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "recipient";
            readonly type: "address";
            readonly internalType: "address";
        }];
    }];
    readonly outputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "editOrder";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "p";
        readonly type: "tuple";
        readonly internalType: "struct PoincareDCA.EditParams";
        readonly components: readonly [{
            readonly name: "slices";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "interval";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "startTime";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "deadline";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "maxSpreadBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "pauseOnTrend";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "catchUp";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "maxSlippageBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "minPriceWad";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "executeSlice";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "amountOut";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "getOrder";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "tuple";
        readonly internalType: "struct PoincareDCA.Order";
        readonly components: readonly [{
            readonly name: "owner";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "recipient";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "zeroForOne";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "pauseOnTrend";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "catchUp";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "cancelled";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "paused";
            readonly type: "bool";
            readonly internalType: "bool";
        }, {
            readonly name: "maxSpreadBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "maxSlippageBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "slices";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "interval";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "filled";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "scheduleFilled";
            readonly type: "uint32";
            readonly internalType: "uint32";
        }, {
            readonly name: "startTime";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "deadline";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "lastSlotPlusOne";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "amountIn";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "scheduleBudget";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "remaining";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "amountOut";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "refunded";
            readonly type: "uint128";
            readonly internalType: "uint128";
        }, {
            readonly name: "minPriceWad";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }];
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "hook";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract PoincareHook";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "isKeeper";
    readonly inputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lens";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract PoincareLens";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "nextOrderId";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "openOrderCount";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "openOrders";
    readonly inputs: readonly [{
        readonly name: "offset";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "limit";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "ids";
        readonly type: "uint256[]";
        readonly internalType: "uint256[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "ordersOf";
    readonly inputs: readonly [{
        readonly name: "owner_";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256[]";
        readonly internalType: "uint256[]";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "owner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "pause";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "pendingOwner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "poolFee";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint24";
        readonly internalType: "uint24";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "poolTickSpacing";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "int24";
        readonly internalType: "int24";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "renounceOwnership";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "resume";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "router";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IUniswapV4Router04";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "setKeeper";
    readonly inputs: readonly [{
        readonly name: "keeper";
        readonly type: "address";
        readonly internalType: "address";
    }, {
        readonly name: "allowed";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "token0";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IERC20";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "token1";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IERC20";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "transferOwnership";
    readonly inputs: readonly [{
        readonly name: "newOwner";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "event";
    readonly name: "KeeperSet";
    readonly inputs: readonly [{
        readonly name: "keeper";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "allowed";
        readonly type: "bool";
        readonly indexed: false;
        readonly internalType: "bool";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderCancelled";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "refunded";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderCreated";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "zeroForOne";
        readonly type: "bool";
        readonly indexed: false;
        readonly internalType: "bool";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "slices";
        readonly type: "uint32";
        readonly indexed: false;
        readonly internalType: "uint32";
    }, {
        readonly name: "interval";
        readonly type: "uint32";
        readonly indexed: false;
        readonly internalType: "uint32";
    }, {
        readonly name: "startTime";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }, {
        readonly name: "deadline";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderEdited";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "slices";
        readonly type: "uint32";
        readonly indexed: false;
        readonly internalType: "uint32";
    }, {
        readonly name: "interval";
        readonly type: "uint32";
        readonly indexed: false;
        readonly internalType: "uint32";
    }, {
        readonly name: "startTime";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }, {
        readonly name: "deadline";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderExpired";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "refunded";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderFilled";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "amountOut";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderPaused";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OrderResumed";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferStarted";
    readonly inputs: readonly [{
        readonly name: "previousOwner";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "newOwner";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferred";
    readonly inputs: readonly [{
        readonly name: "previousOwner";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "newOwner";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "SliceExecuted";
    readonly inputs: readonly [{
        readonly name: "id";
        readonly type: "uint256";
        readonly indexed: true;
        readonly internalType: "uint256";
    }, {
        readonly name: "slot";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }, {
        readonly name: "amountIn";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "amountOut";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "spreadBps";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "filled";
        readonly type: "uint32";
        readonly indexed: false;
        readonly internalType: "uint32";
    }, {
        readonly name: "remaining";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "error";
    readonly name: "AddressEmptyCode";
    readonly inputs: readonly [{
        readonly name: "target";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "AddressInsufficientBalance";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "AlreadyInState";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "FailedInnerCall";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidParams";
    readonly inputs: readonly [{
        readonly name: "reason";
        readonly type: "string";
        readonly internalType: "string";
    }];
}, {
    readonly type: "error";
    readonly name: "NotAuthorized";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "NotExecutable";
    readonly inputs: readonly [{
        readonly name: "status";
        readonly type: "uint8";
        readonly internalType: "enum PoincareDCA.Status";
    }];
}, {
    readonly type: "error";
    readonly name: "NotExpired";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "OrderClosed";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "OwnableInvalidOwner";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "OwnableUnauthorizedAccount";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "ReentrancyGuardReentrantCall";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "SafeERC20FailedOperation";
    readonly inputs: readonly [{
        readonly name: "token";
        readonly type: "address";
        readonly internalType: "address";
    }];
}, {
    readonly type: "error";
    readonly name: "UnknownOrder";
    readonly inputs: readonly [];
}];

declare const erc20Abi: readonly [{
    readonly type: "function";
    readonly name: "approve";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly type: "bool";
    }];
}, {
    readonly type: "function";
    readonly name: "allowance";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "balanceOf";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "account";
        readonly type: "address";
    }];
    readonly outputs: readonly [{
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "decimals";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "uint8";
    }];
}, {
    readonly type: "function";
    readonly name: "symbol";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly type: "string";
    }];
}];

/** Every address the SDK needs for one Poincaré deployment. */
type PoincareDeployment = {
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
declare const TOKEN_DECIMALS = 18;
/** The live testnet pool (deployments/unichain-sepolia.json). */
declare const UNICHAIN_SEPOLIA: PoincareDeployment;
/** A deployment with the DCA periphery address filled in (e.g. from unichain-sepolia-dca.json). */
declare function withDca(dep: PoincareDeployment, dca: Address, dcaDeployBlock?: bigint): PoincareDeployment;
declare class DcaNotDeployedError extends Error {
    constructor(chain: string);
}
declare function requireDca(dep: PoincareDeployment): Address;

declare const WAD: bigint;
declare const BPS = 10000n;
/** A WAD fixed-point value as a JS number (display / ratios only, not for amounts on chain). */
declare const fromWad: (x: bigint) => number;
/** Spread or fee as basis points, rounded UP: the same rounding PoincareDCA applies on chain. */
declare const wadToBpsUp: (x: bigint) => number;
/** A decimal string or number (e.g. "2300.5", 0.25) as an exact WAD bigint, without float drift. */
declare function decimalToWad(v: string | number): bigint;
/** Token amount in base units. A bigint is taken as already in base units. */
declare function toAmount(v: string | number | bigint, decimals?: number): bigint;
declare const formatAmount: (v: bigint, decimals?: number) => string;

/** Cusum.Trend as the hook stores it: 0 None, 1 Up, 2 Down (hook orientation). */
type HookTrend = 0 | 1 | 2;
/** Trend of the USDC-per-WETH market price. */
type MarketTrend = "none" | "up" | "down";
/** buy = pay USDC for WETH (zeroForOne); sell = pay WETH for USDC. */
type Side = "buy" | "sell";
declare const sideToZeroForOne: (side: Side) => boolean;
declare const zeroForOneToSide: (zeroForOne: boolean) => Side;
declare function marketTrend(t: HookTrend | number): MarketTrend;
/**
 * The side a trend makes "with-trend": the side the hook charges its spread on once kappa
 * ramps. Mirrors PoincareHook._spreadGiven: hook Up is pushed by oneForZero (sells of WETH),
 * hook Down by zeroForOne (buys of WETH). In market terms: buyers push an up-trend, sellers a
 * down-trend.
 */
declare function withTrendSide(t: HookTrend | number): Side | null;
/**
 * calm: no confirmed trend and little evidence; building: evidence past 60% of the threshold
 * but nothing charged yet; engaged: a trend is confirmed and the with-trend side pays a spread.
 * The same classification the app shows.
 */
type RegimeLevel = "calm" | "building" | "engaged";
type Regime = {
    /** Block the snapshot was read at. */
    blockNumber: bigint;
    /** Mid price, USDC per WETH (spread- and fee-free). */
    price: number;
    trend: MarketTrend;
    level: RegimeLevel;
    /** Directional efficiency is below its floor: moves read as chop, nothing will be charged. */
    gated: boolean;
    /** CUSUM evidence in market orientation, and its progress toward the threshold (0..1). */
    evidence: {
        up: number;
        down: number;
        threshold: number;
        progress: number;
    };
    /** The side pushing with the detected trend (it pays the spread once kappa > 0). */
    withTrendSide: Side | null;
    /** The side charged right now, if any. */
    chargedSide: Side | null;
    /** Spread each side pays in THIS block (the hook's own projection), fraction (0.05 = 5%). */
    spread: {
        buy: number;
        sell: number;
    };
    kappa: number;
    kappaMax: number;
    /** Volatility-scaled base fee, fraction. */
    fee: number;
    sigma: number;
    directionalEfficiency: number;
    dFloor: number;
    /** Raw on-chain values for integrators that want exact WADs. */
    raw: {
        hookTrend: HookTrend;
        sPos: bigint;
        sNeg: bigint;
        thresholdH: bigint;
        kappa: bigint;
        spreadBuy: bigint;
        spreadSell: bigint;
        feeWad: bigint;
        midPriceWad: bigint;
    };
};
declare function classify(progress: number, kappa: number): RegimeLevel;
/** Read the regime the next swap of this block would see (hook.previewDetector / previewSpread). */
declare function readRegime(client: PublicClient, dep: PoincareDeployment, opts?: {
    blockNumber?: bigint;
}): Promise<Regime>;
type Snap = {
    sPos: bigint;
    sNeg: bigint;
    d: bigint;
    sigma: bigint;
    kappa: bigint;
    trend: number;
};
/** Pure assembly of a Regime from raw reads (exported for tests and custom transports). */
declare function toRegime(blockNumber: bigint, snap: Snap, buy: readonly [bigint, bigint], sell: readonly [bigint, bigint], thresholdH: bigint, dFloor: bigint, kappaMax: bigint, midPriceWad: bigint): Regime;
type RegimeEvent = {
    type: "trend-started";
    trend: "up" | "down";
    withTrendSide: Side;
    blockNumber: bigint;
} | {
    type: "trend-ended";
    previous: "up" | "down";
    blockNumber: bigint;
} | {
    type: "trend-flipped";
    from: "up" | "down";
    to: "up" | "down";
    withTrendSide: Side;
    blockNumber: bigint;
} | {
    type: "evidence-building";
    direction: "up" | "down";
    progress: number;
    gated: boolean;
    blockNumber: bigint;
} | {
    type: "spread-engaged";
    side: Side;
    spread: number;
    blockNumber: bigint;
} | {
    type: "spread-released";
    side: Side;
    blockNumber: bigint;
};
/**
 * Turn two consecutive snapshots into the events an integrator acts on. A trend "starts" when
 * the detector confirms one (data-dependent CUSUM crossing, not a fixed block count); the spread
 * "engages" when kappa has ramped enough that the with-trend side actually pays.
 */
declare function diffRegime(prev: Regime | null, next: Regime): RegimeEvent[];
/**
 * Poll the regime every new block and report changes. Returns an unsubscribe function.
 * The first snapshot is reported through `onRegime` and diffed against nothing, so a trend
 * already in progress is reported as `trend-started` once.
 */
declare function watchRegime(client: PublicClient, dep: PoincareDeployment, handlers: {
    onEvent?: (e: RegimeEvent, regime: Regime) => void;
    onRegime?: (regime: Regime) => void;
    onError?: (err: unknown) => void;
    pollingInterval?: number;
}): () => void;
type DetectorSample = {
    blockNumber: bigint;
    /** USDC per WETH at the sample. */
    price: number;
    trend: MarketTrend;
    /** Evidence in market orientation. */
    evidenceUp: number;
    evidenceDown: number;
    kappa: number;
    directionalEfficiency: number;
    sigma: number;
    fee: number;
};
/**
 * DetectorSample logs between two blocks, oldest first, in market orientation. Queried in
 * `chunk`-block windows (the public RPC caps eth_getLogs ranges).
 */
declare function regimeHistory(client: PublicClient, dep: PoincareDeployment, opts: {
    fromBlock: bigint;
    toBlock?: bigint;
    chunk?: bigint;
}): Promise<DetectorSample[]>;
type TrendOnset = {
    blockNumber: bigint;
    type: "start" | "end" | "flip";
    trend: MarketTrend;
    price: number;
};
/** Where trends began, ended or flipped in a sample series. */
declare function trendOnsets(samples: DetectorSample[]): TrendOnset[];

type Quote = {
    side: Side;
    amountIn: bigint;
    amountOut: bigint;
    /** Executed price, USDC per WETH. */
    price: number;
    /** Spread this side pays in this block, fraction. */
    spread: number;
    /** Base fee this block, fraction. */
    fee: number;
};
/**
 * Exact-input quote through the Lens, which projects this block's detector sample, so it matches
 * what the router executes in the same block to the wei.
 */
declare function quoteExactInput(client: PublicClient, dep: PoincareDeployment, side: Side, amountIn: bigint): Promise<Quote>;

/**
 * Pure DCA logic: building and validating order parameters, and an exact off-chain mirror of
 * PoincareDCA's slice rules. Nothing here touches the network; see dcaClient.ts for that.
 */
/** PoincareDCA.Status, in on-chain enum order. */
declare const DCA_STATUS: readonly ["ready", "unknown", "cancelled", "filled", "expired", "not-started", "waiting-for-slot", "spread-too-high", "trend-against", "below-limit", "paused"];
type DcaStatus = (typeof DCA_STATUS)[number];
declare const DCA_STATUS_TEXT: Record<DcaStatus, string>;
declare const statusOf: (code: number) => DcaStatus;
declare const MIN_INTERVAL = 60;
declare const MAX_SLICES = 10000;
/** Human-friendly order description. Amounts are in the INPUT token (USDC to buy, WETH to sell). */
type DcaOrderInput = {
    side: Side;
    /** Total budget. A bigint is base units; a string/number is token units ("1000" = 1000 USDC). */
    amount: string | number | bigint;
    slices: number;
    /** Seconds between slices (>= 60). */
    interval: number;
    /** Unix seconds; omit to start at the block the order is created in. */
    startTime?: number | bigint;
    /** Unix seconds. Defaults to one spare slot after the last planned slice. */
    deadline?: number | bigint;
    /** Alternative to `deadline`: seconds from the start (a TWAP's window). Ignored if `deadline` is set. */
    duration?: number;
    /** Hold a slot while the spread on this side is above this many bps. Default: no cap. */
    maxSpreadBps?: number;
    /** Hold while a trend runs with this side. Default false. */
    pauseOnTrend?: boolean;
    /** Grow later slices to make up skipped slots. Default true. */
    catchUp?: boolean;
    /** Max shortfall vs the in-transaction Lens quote. Default 50 bps. */
    maxSlippageBps?: number;
    /** USDC per WETH: the most a buy pays, or the least a sell accepts. Omit for no limit. */
    limitPrice?: string | number;
    /** Receives every fill. Defaults to the order owner. */
    recipient?: Address;
};
/** PoincareDCA.OrderParams, ready to encode. */
type DcaOrderParams = {
    zeroForOne: boolean;
    amountIn: bigint;
    slices: number;
    interval: number;
    startTime: bigint;
    deadline: bigint;
    maxSpreadBps: number;
    pauseOnTrend: boolean;
    catchUp: boolean;
    maxSlippageBps: number;
    minPriceWad: bigint;
    recipient: Address;
};
declare class DcaParamError extends Error {
    /** The same reason string PoincareDCA reverts with. */
    readonly reason: string;
    constructor(reason: string, detail?: string);
}
/**
 * Limit price (USDC per WETH) -> PoincareDCA.minPriceWad (output per 1 input, WAD).
 * A buy pays USDC and receives WETH, so its floor is WETH per USDC = 1 / price.
 */
declare function limitToMinPriceWad(side: Side, limitPrice: string | number): bigint;
/** The inverse of limitToMinPriceWad, for display. */
declare function minPriceWadToLimit(side: Side, minPriceWad: bigint): number | null;
/** Build PoincareDCA.OrderParams from a human description, validated like the contract. */
declare function buildOrderParams(input: DcaOrderInput, nowSec?: number | bigint): DcaOrderParams;
/** PoincareDCA._validate, with the same reason strings. `dca` rejects the contract as recipient. */
declare function validateOrderParams(p: DcaOrderParams, nowSec: bigint, dca?: Address): void;
/** An order as PoincareDCA.getOrder returns it, plus derived fields. */
type DcaOrder = {
    id: bigint;
    owner: Address;
    recipient: Address;
    side: Side;
    zeroForOne: boolean;
    pauseOnTrend: boolean;
    catchUp: boolean;
    cancelled: boolean;
    paused: boolean;
    maxSpreadBps: number;
    maxSlippageBps: number;
    /** Planned fills of the CURRENT schedule. */
    slices: number;
    interval: number;
    /** Fills over the order's life. */
    filled: number;
    /** Fills in the current schedule (resets when the order is edited). */
    scheduleFilled: number;
    startTime: bigint;
    deadline: bigint;
    lastSlotPlusOne: bigint;
    /** Total deposited; never changes. */
    amountIn: bigint;
    /** What the current schedule spreads (amountIn, then the remainder at each edit). */
    scheduleBudget: bigint;
    remaining: bigint;
    amountOut: bigint;
    /** Returned to the owner on cancel or expiry. */
    refunded: bigint;
    minPriceWad: bigint;
};
declare function toDcaOrder(id: bigint, o: Omit<DcaOrder, "id" | "side">): DcaOrder;
/** Slot geometry: which slot `now` is in, the last slot before the deadline, the next opening. */
declare function slotInfo(o: Pick<DcaOrder, "startTime" | "interval" | "deadline">, now: bigint): {
    slot: bigint;
    lastSlot: bigint;
    nextSlotAt: bigint;
};
/** PoincareDCA._sliceAmount. */
declare function sliceAmount(o: Pick<DcaOrder, "scheduleBudget" | "remaining" | "slices" | "scheduleFilled" | "catchUp">, slot: bigint, lastSlot: bigint): bigint;
/** What PoincareDCA.editOrder takes: a new schedule and rules for the REMAINING budget. */
type DcaEditParams = {
    slices: number;
    interval: number;
    startTime: bigint;
    deadline: bigint;
    maxSpreadBps: number;
    pauseOnTrend: boolean;
    catchUp: boolean;
    maxSlippageBps: number;
    minPriceWad: bigint;
};
/** Human-friendly edit. Anything omitted keeps the order's current value. */
type DcaEditInput = {
    slices?: number;
    interval?: number;
    startTime?: number | bigint;
    deadline?: number | bigint;
    /** Alternative to `deadline`: seconds from the new start. */
    duration?: number;
    maxSpreadBps?: number;
    pauseOnTrend?: boolean;
    catchUp?: boolean;
    maxSlippageBps?: number;
    /** USDC per WETH; `null` removes the limit. */
    limitPrice?: string | number | null;
};
/**
 * Edit params validated exactly like PoincareDCA.editOrder: the remaining budget is re-planned
 * from the new start. The deadline defaults to one spare slot after the last new slice.
 */
declare function buildEditParams(o: DcaOrder, input: DcaEditInput, nowSec?: number | bigint): DcaEditParams;
type SlicePlan = {
    status: DcaStatus;
    amountIn: bigint;
    /** Only when `quoteOut` was supplied and the time/spread/trend checks passed. */
    minOut: bigint;
    slot: bigint;
    nextSlotAt: bigint;
};
/**
 * PoincareDCA._preview without the chain reads: supply the spread this block (bps, rounded up),
 * whether a trend runs with the order's side, and optionally the Lens quote for the slice.
 */
declare function planSlice(o: DcaOrder, ctx: {
    now: bigint;
    spreadBps: number;
    trendWithSide: boolean;
    quoteOut?: bigint;
}): SlicePlan;
/** Fraction of the budget filled so far (0..1). */
/** Input actually swapped so far: the budget minus what is left and what was refunded. */
declare const spentOf: (o: Pick<DcaOrder, "amountIn" | "remaining" | "refunded">) => bigint;
/** Share of the budget actually swapped, 0..1 (a refunded order stops short of 1). */
declare const progressOf: (o: Pick<DcaOrder, "amountIn" | "remaining" | "refunded">) => number;

/**
 * Exchange-style plan builders. Centralised exchanges describe DCA in two ways, and users arrive
 * expecting one of them:
 *
 *  - a RECURRING buy: a fixed amount every period, N times (Coinbase, Kraken, Binance Auto-Invest,
 *    OKX recurring buy, Bybit DCA bot);
 *  - a TWAP: one total spread evenly over a duration (Binance Spot TWAP, 5 min to 24 h).
 *
 * Both compile to the same PoincareDCA order. The Poincaré part is the PROTECTION preset: whether
 * a buy may pay the trend spread the pool charges the with-trend side.
 */
declare const FREQUENCIES: {
    readonly "5m": 300;
    readonly "15m": 900;
    readonly "1h": 3600;
    readonly "4h": 14400;
    readonly "1d": 86400;
    readonly "1w": 604800;
};
type Frequency = keyof typeof FREQUENCIES;
declare const FREQUENCY_LABEL: Record<Frequency, string>;
declare const PROTECTIONS: {
    /** Skip a buy while this side pays the trend spread; later buys make it up. The Poincaré default. */
    readonly "spread-guard": {
        readonly maxSpreadBps: 0;
        readonly pauseOnTrend: false;
        readonly catchUp: true;
    };
    /** Also hold while a trend runs with this side, before the spread has even ramped. */
    readonly "trend-pause": {
        readonly maxSpreadBps: 0;
        readonly pauseOnTrend: true;
        readonly catchUp: true;
    };
    /** Buy every period whatever the spread, like a plain recurring buy. */
    readonly always: {
        readonly maxSpreadBps: 10000;
        readonly pauseOnTrend: false;
        readonly catchUp: true;
    };
};
type Protection = keyof typeof PROTECTIONS;
declare const PROTECTION_TEXT: Record<Protection, {
    title: string;
    detail: string;
}>;
type Common = {
    side: Side;
    protection?: Protection;
    /** USDC per WETH: the most a buy pays / the least a sell accepts. */
    limitPrice?: string | number;
    maxSlippageBps?: number;
    /** Unix seconds; omit to start now. */
    startTime?: number | bigint;
    recipient?: Address;
};
/** A fixed amount every period, `count` times. The budget escrowed is amountPerBuy × count. */
declare function recurringOrder(r: Common & {
    amountPerBuy: string | number | bigint;
    frequency: Frequency | number;
    count: number;
}): DcaOrderInput;
/**
 * One total, spread evenly over `durationSec`. Slices default to one every five minutes (2..48);
 * the deadline is the end of the window, so a TWAP never runs past the duration you chose.
 */
declare function twapOrder(t: Common & {
    total: string | number | bigint;
    durationSec: number;
    slices?: number;
}): DcaOrderInput;
/** Default TWAP slicing: one buy every ~5 minutes, at least 2 and at most 48 buys. */
declare function twapSlices(durationSec: number): number;

/**
 * Explicit gas limits. Testnet eth_estimateGas mis-simulates calls that run through the hook,
 * so every transaction the SDK builds carries a limit with headroom instead of relying on it.
 */
declare const DCA_GAS: {
    readonly approve: 80000n;
    readonly createOrder: 450000n;
    readonly executeSlice: 1500000n;
    readonly cancel: 200000n;
    readonly closeExpired: 200000n;
    readonly pause: 80000n;
    readonly resume: 80000n;
    readonly editOrder: 150000n;
};
/** An unsigned transaction: send it from any wallet. */
type TxRequest = {
    to: Address;
    data: Hex;
    value: bigint;
    gas: bigint;
    description: string;
};
/** What PoincareDCA.canExecute reports for an order right now. */
type SlicePreview = {
    status: DcaStatus;
    amountIn: bigint;
    quoteOut: bigint;
    minOut: bigint;
    spreadBps: number;
    slot: bigint;
    nextSlotAt: bigint;
};
declare function getOrder(client: PublicClient, dep: PoincareDeployment, id: bigint): Promise<DcaOrder | null>;
declare function getOrdersOf(client: PublicClient, dep: PoincareDeployment, owner: Address): Promise<DcaOrder[]>;
/** Every open order id, paging through openOrders. */
declare function getOpenOrderIds(client: PublicClient, dep: PoincareDeployment, pageSize?: bigint): Promise<bigint[]>;
/** The contract's own verdict on the next slice (spread, trend, limit, schedule). */
declare function previewSlice(client: PublicClient, dep: PoincareDeployment, id: bigint): Promise<SlicePreview>;
/**
 * The owner's allowance to the DCA contract. Pass `atBlock` (the block of the owner's latest
 * transaction) right after a transaction: public RPCs balance reads across replicas, and a lagging
 * one answers from old state, e.g. an allowance the previous createOrder already spent. Reading at
 * an explicit block makes such a replica fail instead, and the read is retried until one has it.
 */
declare function allowanceFor(client: PublicClient, dep: PoincareDeployment, owner: Address, side: Side, atBlock?: bigint): Promise<bigint>;
/** Approve exactly the order budget (never an unlimited allowance). */
declare function buildApproveTx(dep: PoincareDeployment, side: Side, amount: bigint): TxRequest;
declare function buildCreateOrderTx(dep: PoincareDeployment, p: DcaOrderParams): TxRequest;
/** Fill the current slot's slice. Only a keeper or the order's owner may send it. */
declare const buildExecuteSliceTx: (dep: PoincareDeployment, id: bigint) => TxRequest;
/** Cancel and refund. Only the order's owner may send it. */
declare const buildCancelTx: (dep: PoincareDeployment, id: bigint) => TxRequest;
/** Hold the order. Only the order's owner may send it. */
declare const buildPauseTx: (dep: PoincareDeployment, id: bigint) => TxRequest;
/** Let a paused order fill again. Only the order's owner may send it. */
declare const buildResumeTx: (dep: PoincareDeployment, id: bigint) => TxRequest;
/** Re-plan the remaining budget (build the params with buildEditParams). Owner only. */
declare function buildEditTx(dep: PoincareDeployment, id: bigint, p: DcaEditParams): TxRequest;
/** After the deadline, refund the unfilled budget to the owner. Anyone may send it. */
declare const buildCloseExpiredTx: (dep: PoincareDeployment, id: bigint) => TxRequest;
/** Everything a wallet must sign to open this order: an approval if needed, then the order.
 *  `atBlock`: see allowanceFor (pass it when the owner transacted moments ago). */
declare function planCreateOrder(client: PublicClient, dep: PoincareDeployment, owner: Address, p: DcaOrderParams, opts?: {
    atBlock?: bigint;
}): Promise<TxRequest[]>;
declare class TxRevertedError extends Error {
    readonly hash: Hash;
    constructor(hash: Hash);
}
/** Send one TxRequest with its explicit gas, wait for it, and fail loudly on a revert. */
declare function sendTx(wallet: WalletClient, client: PublicClient, tx: TxRequest, opts?: {
    account?: Account | Address;
    chain?: Chain;
}): Promise<TransactionReceipt>;
/** The order id from a createOrder receipt. */
declare function orderIdFromReceipt(dep: PoincareDeployment, receipt: TransactionReceipt): bigint;

type VerifySiweMessageParameters = Prettify<Pick<VerifyHashParameters, 'blockNumber' | 'blockTag'> & Pick<ValidateSiweMessageParameters, 'address' | 'domain' | 'nonce' | 'scheme' | 'time'> & {
    /**
     * EIP-4361 formatted message.
     */
    message: string;
    /**
     * Signature to check against.
     */
    signature: Hex$1;
}>;
type VerifySiweMessageReturnType = boolean;

type CcipRequestReturnType = Hex$2;

type PoincareClientOptions = {
    deployment?: PoincareDeployment;
    /** Overrides the deployment's public RPC. */
    rpcUrl?: string;
    /** Bring your own viem public client instead. */
    publicClient?: PublicClient;
    /** Needed only for the write helpers (create / cancel / execute / refund). */
    walletClient?: WalletClient;
};
/**
 * One object with everything: regime reads and watching, quotes, and DCA orders. Reads need no
 * wallet. Writes go through `walletClient` when one is given; every write also exists as an
 * unsigned `build*` transaction for wallets and agents that sign elsewhere.
 */
declare function createPoincareClient(opts?: PoincareClientOptions): {
    deployment: PoincareDeployment;
    publicClient: {
        account: undefined;
        batch?: {
            multicall?: boolean | viem.Prettify<viem.MulticallBatchOptions> | undefined;
        } | undefined;
        cacheTime: number;
        ccipRead?: false | {
            request?: (parameters: viem.CcipRequestParameters) => Promise<CcipRequestReturnType>;
        } | undefined;
        chain: viem.Chain | undefined;
        dataSuffix?: viem.DataSuffix | undefined;
        experimental_blockTag?: viem.BlockTag | undefined;
        key: string;
        name: string;
        pollingInterval: number;
        request: viem.EIP1193RequestFn<viem.PublicRpcSchema>;
        transport: viem.TransportConfig<string, viem.EIP1193RequestFn> & Record<string, any>;
        type: string;
        uid: string;
        call: (parameters: viem.CallParameters<viem.Chain | undefined>) => Promise<viem.CallReturnType>;
        createAccessList: (parameters: viem.CreateAccessListParameters<viem.Chain | undefined>) => Promise<{
            accessList: viem.AccessList;
            gasUsed: bigint;
        }>;
        createBlockFilter: () => Promise<viem.CreateBlockFilterReturnType>;
        createContractEventFilter: <const abi extends viem.Abi | readonly unknown[], eventName extends viem.ContractEventName<abi> | undefined, args extends viem.MaybeExtractEventArgsFromAbi<abi, eventName> | undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined>(args: viem.CreateContractEventFilterParameters<abi, eventName, args, strict, fromBlock, toBlock>) => Promise<viem.CreateContractEventFilterReturnType<abi, eventName, args, strict, fromBlock, toBlock>>;
        createEventFilter: <const abiEvent extends viem.AbiEvent | undefined = undefined, const abiEvents extends readonly viem.AbiEvent[] | readonly unknown[] | undefined = abiEvent extends viem.AbiEvent ? [abiEvent] : undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, _EventName extends string | undefined = viem.MaybeAbiEventName<abiEvent>, _Args extends viem.MaybeExtractEventArgsFromAbi<abiEvents, _EventName> | undefined = undefined>(args?: viem.CreateEventFilterParameters<abiEvent, abiEvents, strict, fromBlock, toBlock, _EventName, _Args> | undefined) => Promise<viem.CreateEventFilterReturnType<abiEvent, abiEvents, strict, fromBlock, toBlock, _EventName, _Args>>;
        createPendingTransactionFilter: () => Promise<viem.CreatePendingTransactionFilterReturnType>;
        estimateContractGas: <chain extends viem.Chain | undefined, const abi extends viem.Abi | readonly unknown[], functionName extends viem.ContractFunctionName<abi, "nonpayable" | "payable">, args extends viem.ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>>(args: viem.EstimateContractGasParameters<abi, functionName, args, chain>) => Promise<viem.EstimateContractGasReturnType>;
        estimateGas: (args: viem.EstimateGasParameters<viem.Chain | undefined>) => Promise<viem.EstimateGasReturnType>;
        fillTransaction: <chainOverride extends viem.Chain | undefined = undefined, accountOverride extends viem.Account | Address | undefined = undefined>(args: viem.FillTransactionParameters<viem.Chain | undefined, viem.Account | undefined, chainOverride, accountOverride>) => Promise<viem.FillTransactionReturnType<viem.Chain | undefined, chainOverride>>;
        getBalance: (args: viem.GetBalanceParameters) => Promise<viem.GetBalanceReturnType>;
        getBlobBaseFee: () => Promise<viem.GetBlobBaseFeeReturnType>;
        getBlock: <includeTransactions extends boolean = false, blockTag extends viem.BlockTag = "latest">(args?: viem.GetBlockParameters<includeTransactions, blockTag> | undefined) => Promise<{
            number: blockTag extends "pending" ? null : bigint;
            nonce: blockTag extends "pending" ? null : `0x${string}`;
            hash: blockTag extends "pending" ? null : `0x${string}`;
            logsBloom: blockTag extends "pending" ? null : `0x${string}`;
            baseFeePerGas: bigint | null;
            blobGasUsed: bigint;
            difficulty: bigint;
            excessBlobGas: bigint;
            extraData: viem.Hex;
            gasLimit: bigint;
            gasUsed: bigint;
            miner: Address;
            mixHash: viem.Hash;
            parentBeaconBlockRoot?: `0x${string}` | undefined;
            parentHash: viem.Hash;
            receiptsRoot: viem.Hex;
            sealFields: viem.Hex[];
            sha3Uncles: viem.Hash;
            size: bigint;
            stateRoot: viem.Hash;
            timestamp: bigint;
            totalDifficulty: bigint | null;
            transactionsRoot: viem.Hash;
            uncles: viem.Hash[];
            withdrawals?: viem.Withdrawal[] | undefined | undefined;
            withdrawalsRoot?: `0x${string}` | undefined;
            transactions: includeTransactions extends true ? ({
                s: viem.Hex;
                r: viem.Hex;
                type: "legacy";
                to: Address | null;
                from: Address;
                gas: bigint;
                nonce: number;
                value: bigint;
                blobVersionedHashes?: undefined | undefined;
                gasPrice: bigint;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                hash: viem.Hash;
                v: bigint;
                yParity?: undefined | undefined;
                chainId?: number | undefined;
                blockTimestamp?: bigint | undefined;
                input: viem.Hex;
                typeHex: viem.Hex | null;
                blockNumber: (blockTag extends "pending" ? true : false) extends infer T ? T extends (blockTag extends "pending" ? true : false) ? T extends true ? null : bigint : never : never;
                blockHash: (blockTag extends "pending" ? true : false) extends infer T_1 ? T_1 extends (blockTag extends "pending" ? true : false) ? T_1 extends true ? null : `0x${string}` : never : never;
                transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_2 ? T_2 extends (blockTag extends "pending" ? true : false) ? T_2 extends true ? null : number : never : never;
            } | {
                s: viem.Hex;
                r: viem.Hex;
                type: "eip2930";
                to: Address | null;
                from: Address;
                gas: bigint;
                nonce: number;
                value: bigint;
                blobVersionedHashes?: undefined | undefined;
                gasPrice: bigint;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
                accessList: viem.AccessList;
                authorizationList?: undefined | undefined;
                hash: viem.Hash;
                v: bigint;
                yParity: number;
                chainId: number;
                blockTimestamp?: bigint | undefined;
                input: viem.Hex;
                typeHex: viem.Hex | null;
                blockNumber: (blockTag extends "pending" ? true : false) extends infer T_3 ? T_3 extends (blockTag extends "pending" ? true : false) ? T_3 extends true ? null : bigint : never : never;
                blockHash: (blockTag extends "pending" ? true : false) extends infer T_4 ? T_4 extends (blockTag extends "pending" ? true : false) ? T_4 extends true ? null : `0x${string}` : never : never;
                transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_5 ? T_5 extends (blockTag extends "pending" ? true : false) ? T_5 extends true ? null : number : never : never;
            } | {
                s: viem.Hex;
                r: viem.Hex;
                type: "eip1559";
                to: Address | null;
                from: Address;
                gas: bigint;
                nonce: number;
                value: bigint;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas: bigint;
                maxPriorityFeePerGas: bigint;
                accessList: viem.AccessList;
                authorizationList?: undefined | undefined;
                hash: viem.Hash;
                v: bigint;
                yParity: number;
                chainId: number;
                blockTimestamp?: bigint | undefined;
                input: viem.Hex;
                typeHex: viem.Hex | null;
                blockNumber: (blockTag extends "pending" ? true : false) extends infer T_6 ? T_6 extends (blockTag extends "pending" ? true : false) ? T_6 extends true ? null : bigint : never : never;
                blockHash: (blockTag extends "pending" ? true : false) extends infer T_7 ? T_7 extends (blockTag extends "pending" ? true : false) ? T_7 extends true ? null : `0x${string}` : never : never;
                transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_8 ? T_8 extends (blockTag extends "pending" ? true : false) ? T_8 extends true ? null : number : never : never;
            } | {
                s: viem.Hex;
                r: viem.Hex;
                type: "eip4844";
                to: Address | null;
                from: Address;
                gas: bigint;
                nonce: number;
                value: bigint;
                blobVersionedHashes: readonly viem.Hex[];
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas: bigint;
                maxFeePerGas: bigint;
                maxPriorityFeePerGas: bigint;
                accessList: viem.AccessList;
                authorizationList?: undefined | undefined;
                hash: viem.Hash;
                v: bigint;
                yParity: number;
                chainId: number;
                blockTimestamp?: bigint | undefined;
                input: viem.Hex;
                typeHex: viem.Hex | null;
                blockNumber: (blockTag extends "pending" ? true : false) extends infer T_9 ? T_9 extends (blockTag extends "pending" ? true : false) ? T_9 extends true ? null : bigint : never : never;
                blockHash: (blockTag extends "pending" ? true : false) extends infer T_10 ? T_10 extends (blockTag extends "pending" ? true : false) ? T_10 extends true ? null : `0x${string}` : never : never;
                transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_11 ? T_11 extends (blockTag extends "pending" ? true : false) ? T_11 extends true ? null : number : never : never;
            } | {
                s: viem.Hex;
                r: viem.Hex;
                type: "eip7702";
                to: Address | null;
                from: Address;
                gas: bigint;
                nonce: number;
                value: bigint;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas: bigint;
                maxPriorityFeePerGas: bigint;
                accessList: viem.AccessList;
                authorizationList: viem.SignedAuthorizationList;
                hash: viem.Hash;
                v: bigint;
                yParity: number;
                chainId: number;
                blockTimestamp?: bigint | undefined;
                input: viem.Hex;
                typeHex: viem.Hex | null;
                blockNumber: (blockTag extends "pending" ? true : false) extends infer T_12 ? T_12 extends (blockTag extends "pending" ? true : false) ? T_12 extends true ? null : bigint : never : never;
                blockHash: (blockTag extends "pending" ? true : false) extends infer T_13 ? T_13 extends (blockTag extends "pending" ? true : false) ? T_13 extends true ? null : `0x${string}` : never : never;
                transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_14 ? T_14 extends (blockTag extends "pending" ? true : false) ? T_14 extends true ? null : number : never : never;
            })[] : `0x${string}`[];
        }>;
        getBlockReceipts: (args?: viem.GetBlockReceiptsParameters | undefined) => Promise<viem.GetBlockReceiptsReturnType<viem.Chain | undefined>>;
        getBlockNumber: (args?: viem.GetBlockNumberParameters | undefined) => Promise<viem.GetBlockNumberReturnType>;
        getBlockTransactionCount: (args?: viem.GetBlockTransactionCountParameters | undefined) => Promise<viem.GetBlockTransactionCountReturnType>;
        getBytecode: (args: viem.GetBytecodeParameters) => Promise<viem.GetBytecodeReturnType>;
        getChainId: () => Promise<viem.GetChainIdReturnType>;
        getCode: (args: viem.GetBytecodeParameters) => Promise<viem.GetBytecodeReturnType>;
        getContractEvents: <const abi extends viem.Abi | readonly unknown[], eventName extends viem.ContractEventName<abi> | undefined = undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined>(args: viem.GetContractEventsParameters<abi, eventName, strict, fromBlock, toBlock>) => Promise<viem.GetContractEventsReturnType<abi, eventName, strict, fromBlock, toBlock>>;
        getDelegation: (args: viem.GetDelegationParameters) => Promise<viem.GetDelegationReturnType>;
        getEip712Domain: (args: viem.GetEip712DomainParameters) => Promise<viem.GetEip712DomainReturnType>;
        getEnsAddress: (args: viem.GetEnsAddressParameters) => Promise<viem.GetEnsAddressReturnType>;
        getEnsAvatar: (args: viem.GetEnsAvatarParameters) => Promise<viem.GetEnsAvatarReturnType>;
        getEnsName: (args: viem.GetEnsNameParameters) => Promise<viem.GetEnsNameReturnType>;
        getEnsResolver: (args: viem.GetEnsResolverParameters) => Promise<viem.GetEnsResolverReturnType>;
        getEnsText: (args: viem.GetEnsTextParameters) => Promise<viem.GetEnsTextReturnType>;
        getFeeHistory: (args: viem.GetFeeHistoryParameters) => Promise<viem.GetFeeHistoryReturnType>;
        estimateFeesPerGas: <chainOverride extends viem.Chain | undefined = undefined, type extends viem.FeeValuesType = "eip1559">(args?: viem.EstimateFeesPerGasParameters<viem.Chain | undefined, chainOverride, type> | undefined) => Promise<viem.EstimateFeesPerGasReturnType<type>>;
        getFilterChanges: <filterType extends viem.FilterType, const abi extends viem.Abi | readonly unknown[] | undefined, eventName extends string | undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined>(args: viem.GetFilterChangesParameters<filterType, abi, eventName, strict, fromBlock, toBlock>) => Promise<viem.GetFilterChangesReturnType<filterType, abi, eventName, strict, fromBlock, toBlock>>;
        getFilterLogs: <const abi extends viem.Abi | readonly unknown[] | undefined, eventName extends string | undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined>(args: viem.GetFilterLogsParameters<abi, eventName, strict, fromBlock, toBlock>) => Promise<viem.GetFilterLogsReturnType<abi, eventName, strict, fromBlock, toBlock>>;
        getGasPrice: () => Promise<viem.GetGasPriceReturnType>;
        getLogs: <const abiEvent extends viem.AbiEvent | undefined = undefined, const abiEvents extends readonly viem.AbiEvent[] | readonly unknown[] | undefined = abiEvent extends viem.AbiEvent ? [abiEvent] : undefined, strict extends boolean | undefined = undefined, fromBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined, toBlock extends viem.BlockNumber | viem.BlockTag | undefined = undefined>(args?: viem.GetLogsParameters<abiEvent, abiEvents, strict, fromBlock, toBlock> | undefined) => Promise<viem.GetLogsReturnType<abiEvent, abiEvents, strict, fromBlock, toBlock>>;
        getProof: (args: viem.GetProofParameters) => Promise<viem.GetProofReturnType>;
        estimateMaxPriorityFeePerGas: <chainOverride extends viem.Chain | undefined = undefined>(args?: {
            chain: chainOverride | null;
        } | undefined) => Promise<viem.EstimateMaxPriorityFeePerGasReturnType>;
        getStorageAt: (args: viem.GetStorageAtParameters) => Promise<viem.GetStorageAtReturnType>;
        getTransaction: <blockTag extends viem.BlockTag = "latest">(args: viem.GetTransactionParameters<blockTag>) => Promise<{
            s: viem.Hex;
            r: viem.Hex;
            type: "legacy";
            to: Address | null;
            from: Address;
            gas: bigint;
            nonce: number;
            value: bigint;
            blobVersionedHashes?: undefined | undefined;
            gasPrice: bigint;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            hash: viem.Hash;
            v: bigint;
            yParity?: undefined | undefined;
            chainId?: number | undefined;
            blockTimestamp?: bigint | undefined;
            input: viem.Hex;
            typeHex: viem.Hex | null;
            blockNumber: (blockTag extends "pending" ? true : false) extends infer T ? T extends (blockTag extends "pending" ? true : false) ? T extends true ? null : bigint : never : never;
            blockHash: (blockTag extends "pending" ? true : false) extends infer T_1 ? T_1 extends (blockTag extends "pending" ? true : false) ? T_1 extends true ? null : `0x${string}` : never : never;
            transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_2 ? T_2 extends (blockTag extends "pending" ? true : false) ? T_2 extends true ? null : number : never : never;
        } | {
            s: viem.Hex;
            r: viem.Hex;
            type: "eip2930";
            to: Address | null;
            from: Address;
            gas: bigint;
            nonce: number;
            value: bigint;
            blobVersionedHashes?: undefined | undefined;
            gasPrice: bigint;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
            accessList: viem.AccessList;
            authorizationList?: undefined | undefined;
            hash: viem.Hash;
            v: bigint;
            yParity: number;
            chainId: number;
            blockTimestamp?: bigint | undefined;
            input: viem.Hex;
            typeHex: viem.Hex | null;
            blockNumber: (blockTag extends "pending" ? true : false) extends infer T_3 ? T_3 extends (blockTag extends "pending" ? true : false) ? T_3 extends true ? null : bigint : never : never;
            blockHash: (blockTag extends "pending" ? true : false) extends infer T_4 ? T_4 extends (blockTag extends "pending" ? true : false) ? T_4 extends true ? null : `0x${string}` : never : never;
            transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_5 ? T_5 extends (blockTag extends "pending" ? true : false) ? T_5 extends true ? null : number : never : never;
        } | {
            s: viem.Hex;
            r: viem.Hex;
            type: "eip1559";
            to: Address | null;
            from: Address;
            gas: bigint;
            nonce: number;
            value: bigint;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas: bigint;
            maxPriorityFeePerGas: bigint;
            accessList: viem.AccessList;
            authorizationList?: undefined | undefined;
            hash: viem.Hash;
            v: bigint;
            yParity: number;
            chainId: number;
            blockTimestamp?: bigint | undefined;
            input: viem.Hex;
            typeHex: viem.Hex | null;
            blockNumber: (blockTag extends "pending" ? true : false) extends infer T_6 ? T_6 extends (blockTag extends "pending" ? true : false) ? T_6 extends true ? null : bigint : never : never;
            blockHash: (blockTag extends "pending" ? true : false) extends infer T_7 ? T_7 extends (blockTag extends "pending" ? true : false) ? T_7 extends true ? null : `0x${string}` : never : never;
            transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_8 ? T_8 extends (blockTag extends "pending" ? true : false) ? T_8 extends true ? null : number : never : never;
        } | {
            s: viem.Hex;
            r: viem.Hex;
            type: "eip4844";
            to: Address | null;
            from: Address;
            gas: bigint;
            nonce: number;
            value: bigint;
            blobVersionedHashes: readonly viem.Hex[];
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas: bigint;
            maxFeePerGas: bigint;
            maxPriorityFeePerGas: bigint;
            accessList: viem.AccessList;
            authorizationList?: undefined | undefined;
            hash: viem.Hash;
            v: bigint;
            yParity: number;
            chainId: number;
            blockTimestamp?: bigint | undefined;
            input: viem.Hex;
            typeHex: viem.Hex | null;
            blockNumber: (blockTag extends "pending" ? true : false) extends infer T_9 ? T_9 extends (blockTag extends "pending" ? true : false) ? T_9 extends true ? null : bigint : never : never;
            blockHash: (blockTag extends "pending" ? true : false) extends infer T_10 ? T_10 extends (blockTag extends "pending" ? true : false) ? T_10 extends true ? null : `0x${string}` : never : never;
            transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_11 ? T_11 extends (blockTag extends "pending" ? true : false) ? T_11 extends true ? null : number : never : never;
        } | {
            s: viem.Hex;
            r: viem.Hex;
            type: "eip7702";
            to: Address | null;
            from: Address;
            gas: bigint;
            nonce: number;
            value: bigint;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas: bigint;
            maxPriorityFeePerGas: bigint;
            accessList: viem.AccessList;
            authorizationList: viem.SignedAuthorizationList;
            hash: viem.Hash;
            v: bigint;
            yParity: number;
            chainId: number;
            blockTimestamp?: bigint | undefined;
            input: viem.Hex;
            typeHex: viem.Hex | null;
            blockNumber: (blockTag extends "pending" ? true : false) extends infer T_12 ? T_12 extends (blockTag extends "pending" ? true : false) ? T_12 extends true ? null : bigint : never : never;
            blockHash: (blockTag extends "pending" ? true : false) extends infer T_13 ? T_13 extends (blockTag extends "pending" ? true : false) ? T_13 extends true ? null : `0x${string}` : never : never;
            transactionIndex: (blockTag extends "pending" ? true : false) extends infer T_14 ? T_14 extends (blockTag extends "pending" ? true : false) ? T_14 extends true ? null : number : never : never;
        }>;
        getTransactionConfirmations: (args: viem.GetTransactionConfirmationsParameters<viem.Chain | undefined>) => Promise<viem.GetTransactionConfirmationsReturnType>;
        getTransactionCount: (args: viem.GetTransactionCountParameters) => Promise<viem.GetTransactionCountReturnType>;
        getTransactionReceipt: (args: viem.GetTransactionReceiptParameters) => Promise<TransactionReceipt>;
        multicall: <const contracts extends readonly unknown[], allowFailure extends boolean = true>(args: viem.MulticallParameters<contracts, allowFailure>) => Promise<viem.MulticallReturnType<contracts, allowFailure>>;
        prepareTransactionRequest: <const request extends viem.PrepareTransactionRequestRequest<viem.Chain | undefined, chainOverride>, chainOverride extends viem.Chain | undefined = undefined, accountOverride extends viem.Account | Address | undefined = undefined>(args: viem.PrepareTransactionRequestParameters<viem.Chain | undefined, viem.Account | undefined, chainOverride, accountOverride, request>) => Promise<viem.UnionRequiredBy<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> & (viem.DeriveChain<viem.Chain | undefined, chainOverride> extends infer T_1 ? T_1 extends viem.DeriveChain<viem.Chain | undefined, chainOverride> ? T_1 extends viem.Chain ? {
            chain: T_1;
        } : {
            chain?: undefined;
        } : never : never) & (viem.DeriveAccount<viem.Account | undefined, accountOverride> extends infer T_2 ? T_2 extends viem.DeriveAccount<viem.Account | undefined, accountOverride> ? T_2 extends viem.Account ? {
            account: T_2;
            from: Address;
        } : {
            account?: undefined;
            from?: undefined;
        } : never : never), viem.IsNever<viem.ExtractFormattedTransactionRequest<viem.DeriveChain<viem.Chain | undefined, chainOverride>, {
            type?: ((request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_3 ? T_3 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_3 extends object ? request extends viem.ExactPartial<T_3> ? T_3 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_4 ? T_4 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_4 extends object ? request extends viem.ExactPartial<T_4> ? T_4 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_5 ? T_5 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_5 extends object ? request extends viem.ExactPartial<T_5> ? T_5 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_6 ? T_6 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_6 extends object ? request extends viem.ExactPartial<T_6> ? T_6 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) extends infer T_7 ? T_7 extends (request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_8 ? T_8 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_8 extends object ? request extends viem.ExactPartial<T_8> ? T_8 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_9 ? T_9 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_9 extends object ? request extends viem.ExactPartial<T_9> ? T_9 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_10 ? T_10 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_10 extends object ? request extends viem.ExactPartial<T_10> ? T_10 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_11 ? T_11 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_11 extends object ? request extends viem.ExactPartial<T_11> ? T_11 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) ? T_7 extends string ? T_7 : undefined : never : never) | undefined;
        }, viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from">, ((request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_12 ? T_12 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_12 extends object ? request extends viem.ExactPartial<T_12> ? T_12 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_13 ? T_13 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_13 extends object ? request extends viem.ExactPartial<T_13> ? T_13 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_14 ? T_14 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_14 extends object ? request extends viem.ExactPartial<T_14> ? T_14 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_15 ? T_15 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_15 extends object ? request extends viem.ExactPartial<T_15> ? T_15 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) extends infer T_16 ? T_16 extends (request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_17 ? T_17 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_17 extends object ? request extends viem.ExactPartial<T_17> ? T_17 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_18 ? T_18 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_18 extends object ? request extends viem.ExactPartial<T_18> ? T_18 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_19 ? T_19 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_19 extends object ? request extends viem.ExactPartial<T_19> ? T_19 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_20 ? T_20 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_20 extends object ? request extends viem.ExactPartial<T_20> ? T_20 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) ? T_16 extends string ? T_16 : undefined : never : never) | undefined>> extends true ? unknown : viem.ExactPartial<viem.ExtractFormattedTransactionRequest<viem.DeriveChain<viem.Chain | undefined, chainOverride>, {
            type?: ((request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_21 ? T_21 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_21 extends object ? request extends viem.ExactPartial<T_21> ? T_21 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_22 ? T_22 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_22 extends object ? request extends viem.ExactPartial<T_22> ? T_22 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_23 ? T_23 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_23 extends object ? request extends viem.ExactPartial<T_23> ? T_23 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_24 ? T_24 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_24 extends object ? request extends viem.ExactPartial<T_24> ? T_24 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) extends infer T_25 ? T_25 extends (request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_26 ? T_26 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_26 extends object ? request extends viem.ExactPartial<T_26> ? T_26 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_27 ? T_27 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_27 extends object ? request extends viem.ExactPartial<T_27> ? T_27 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_28 ? T_28 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_28 extends object ? request extends viem.ExactPartial<T_28> ? T_28 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_29 ? T_29 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_29 extends object ? request extends viem.ExactPartial<T_29> ? T_29 extends {
                type?: infer type | undefined;
            } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
                accessList?: undefined | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } & (viem.OneOf<{
                maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
            } | {
                maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
            }, viem.FeeValuesEIP1559> & {
                accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
            }) ? "eip1559" : never) | (request extends {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: bigint | undefined;
                sidecars?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: undefined | undefined;
                maxPriorityFeePerGas?: undefined | undefined;
            } & {
                accessList: viem.TransactionSerializableEIP2930["accessList"];
            } ? "eip2930" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: undefined | undefined;
                blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
                blobVersionedHashes?: readonly `0x${string}`[] | undefined;
                maxFeePerBlobGas?: bigint | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
            }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
                blobs: viem.TransactionSerializableEIP4844["blobs"];
            } | {
                blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
            } | {
                sidecars: viem.TransactionSerializableEIP4844["sidecars"];
            }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            } | {
                accessList?: viem.AccessList | undefined;
                authorizationList?: viem.SignedAuthorizationList | undefined;
                blobs?: undefined | undefined;
                blobVersionedHashes?: undefined | undefined;
                gasPrice?: undefined | undefined;
                maxFeePerBlobGas?: undefined | undefined;
                maxFeePerGas?: bigint | undefined;
                maxPriorityFeePerGas?: bigint | undefined;
                sidecars?: undefined | undefined;
            }) & {
                authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
            } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) ? T_25 extends string ? T_25 : undefined : never : never) | undefined;
        }, viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from">, ((request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_30 ? T_30 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_30 extends object ? request extends viem.ExactPartial<T_30> ? T_30 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_31 ? T_31 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_31 extends object ? request extends viem.ExactPartial<T_31> ? T_31 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_32 ? T_32 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_32 extends object ? request extends viem.ExactPartial<T_32> ? T_32 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_33 ? T_33 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_33 extends object ? request extends viem.ExactPartial<T_33> ? T_33 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) extends infer T_34 ? T_34 extends (request["type"] extends string ? request["type"] : viem.IsNever<viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_35 ? T_35 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_35 extends object ? request extends viem.ExactPartial<T_35> ? T_35 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_36 ? T_36 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_36 extends object ? request extends viem.ExactPartial<T_36> ? T_36 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never> extends false ? viem.IsNever<Extract<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_37 ? T_37 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_37 extends object ? request extends viem.ExactPartial<T_37> ? T_37 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>>> extends true ? Exclude<viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> extends infer T_38 ? T_38 extends viem.UnionOmit<viem.ExtractChainFormatterParameters<viem.DeriveChain<viem.Chain | undefined, chainOverride>, "transactionRequest", viem.TransactionRequest>, "from"> ? T_38 extends object ? request extends viem.ExactPartial<T_38> ? T_38 extends {
            type?: infer type | undefined;
        } ? Extract<type, string> : never : never : never : never : never, NonNullable<"legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702" | undefined>> : never : request["type"] extends string | undefined ? request["type"] : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)> extends "legacy" ? unknown : viem.GetTransactionType<request, (request extends {
            accessList?: undefined | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & viem.FeeValuesLegacy ? "legacy" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } & (viem.OneOf<{
            maxFeePerGas: viem.FeeValuesEIP1559["maxFeePerGas"];
        } | {
            maxPriorityFeePerGas: viem.FeeValuesEIP1559["maxPriorityFeePerGas"];
        }, viem.FeeValuesEIP1559> & {
            accessList?: viem.TransactionSerializableEIP2930["accessList"] | undefined;
        }) ? "eip1559" : never) | (request extends {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: bigint | undefined;
            sidecars?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: undefined | undefined;
            maxPriorityFeePerGas?: undefined | undefined;
        } & {
            accessList: viem.TransactionSerializableEIP2930["accessList"];
        } ? "eip2930" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: undefined | undefined;
            blobs?: readonly `0x${string}`[] | readonly viem.ByteArray[] | undefined;
            blobVersionedHashes?: readonly `0x${string}`[] | undefined;
            maxFeePerBlobGas?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: false | readonly viem.BlobSidecar<`0x${string}`>[] | undefined;
        }) & (viem.ExactPartial<viem.FeeValuesEIP4844> & viem.OneOf<{
            blobs: viem.TransactionSerializableEIP4844["blobs"];
        } | {
            blobVersionedHashes: viem.TransactionSerializableEIP4844["blobVersionedHashes"];
        } | {
            sidecars: viem.TransactionSerializableEIP4844["sidecars"];
        }, viem.TransactionSerializableEIP4844>) ? "eip4844" : never) | (request extends ({
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        } | {
            accessList?: viem.AccessList | undefined;
            authorizationList?: viem.SignedAuthorizationList | undefined;
            blobs?: undefined | undefined;
            blobVersionedHashes?: undefined | undefined;
            gasPrice?: undefined | undefined;
            maxFeePerBlobGas?: undefined | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            sidecars?: undefined | undefined;
        }) & {
            authorizationList: viem.TransactionSerializableEIP7702["authorizationList"];
        } ? "eip7702" : never) | (request["type"] extends string | undefined ? Extract<request["type"], string> : never)>) ? T_34 extends string ? T_34 : undefined : never : never) | undefined>>> & {
            chainId?: number | undefined;
        }, (request["parameters"] extends readonly viem.PrepareTransactionRequestParameterType[] ? request["parameters"][number] : "type" | "gas" | "nonce" | "blobVersionedHashes" | "fees" | "chainId") extends infer T_39 ? T_39 extends (request["parameters"] extends readonly viem.PrepareTransactionRequestParameterType[] ? request["parameters"][number] : "type" | "gas" | "nonce" | "blobVersionedHashes" | "fees" | "chainId") ? T_39 extends "fees" ? "gasPrice" | "maxFeePerGas" | "maxPriorityFeePerGas" : T_39 : never : never> & (unknown extends request["kzg"] ? {} : Pick<request, "kzg">) & {
            _capabilities?: {
                [x: string]: any;
            } | undefined;
        } extends infer T ? { [K in keyof T]: T[K]; } : never>;
        readContract: <const abi extends viem.Abi | readonly unknown[], functionName extends viem.ContractFunctionName<abi, "pure" | "view">, const args extends viem.ContractFunctionArgs<abi, "pure" | "view", functionName>>(args: viem.ReadContractParameters<abi, functionName, args>) => Promise<viem.ReadContractReturnType<abi, functionName, args>>;
        sendRawTransaction: (args: viem.SendRawTransactionParameters) => Promise<viem.SendRawTransactionReturnType>;
        sendRawTransactionSync: (args: viem.SendRawTransactionSyncParameters) => Promise<TransactionReceipt>;
        simulate: <const calls extends readonly unknown[]>(args: viem.SimulateBlocksParameters<calls>) => Promise<viem.SimulateBlocksReturnType<calls>>;
        simulateBlocks: <const calls extends readonly unknown[]>(args: viem.SimulateBlocksParameters<calls>) => Promise<viem.SimulateBlocksReturnType<calls>>;
        simulateCalls: <const calls extends readonly unknown[]>(args: viem.SimulateCallsParameters<calls>) => Promise<viem.SimulateCallsReturnType<calls>>;
        simulateContract: <const abi extends viem.Abi | readonly unknown[], functionName extends viem.ContractFunctionName<abi, "nonpayable" | "payable">, const args_1 extends viem.ContractFunctionArgs<abi, "nonpayable" | "payable", functionName>, chainOverride extends viem.Chain | undefined, accountOverride extends viem.Account | Address | undefined = undefined>(args: viem.SimulateContractParameters<abi, functionName, args_1, viem.Chain | undefined, chainOverride, accountOverride>) => Promise<viem.SimulateContractReturnType<abi, functionName, args_1, viem.Chain | undefined, viem.Account | undefined, chainOverride, accountOverride>>;
        verifyHash: (args: viem.VerifyHashActionParameters) => Promise<viem.VerifyHashActionReturnType>;
        verifyMessage: (args: viem.VerifyMessageActionParameters) => Promise<viem.VerifyMessageActionReturnType>;
        verifySiweMessage: (args: VerifySiweMessageParameters) => Promise<VerifySiweMessageReturnType>;
        verifyTypedData: (args: viem.VerifyTypedDataActionParameters) => Promise<viem.VerifyTypedDataActionReturnType>;
        uninstallFilter: (args: viem.UninstallFilterParameters) => Promise<viem.UninstallFilterReturnType>;
        waitForTransactionReceipt: (args: viem.WaitForTransactionReceiptParameters<viem.Chain | undefined>) => Promise<TransactionReceipt>;
        watchBlockNumber: (args: viem.WatchBlockNumberParameters) => viem.WatchBlockNumberReturnType;
        watchBlocks: <includeTransactions extends boolean = false, blockTag extends viem.BlockTag = "latest">(args: viem.WatchBlocksParameters<viem.Transport, viem.Chain | undefined, includeTransactions, blockTag>) => viem.WatchBlocksReturnType;
        watchContractEvent: <const abi extends viem.Abi | readonly unknown[], eventName extends viem.ContractEventName<abi>, strict extends boolean | undefined = undefined>(args: viem.WatchContractEventParameters<abi, eventName, strict, viem.Transport>) => viem.WatchContractEventReturnType;
        watchEvent: <const abiEvent extends viem.AbiEvent | undefined = undefined, const abiEvents extends readonly viem.AbiEvent[] | readonly unknown[] | undefined = abiEvent extends viem.AbiEvent ? [abiEvent] : undefined, strict extends boolean | undefined = undefined>(args: viem.WatchEventParameters<abiEvent, abiEvents, strict, viem.Transport>) => viem.WatchEventReturnType;
        watchPendingTransactions: (args: viem.WatchPendingTransactionsParameters<viem.Transport>) => viem.WatchPendingTransactionsReturnType;
        extend: <const client extends {
            [x: string]: unknown;
            account?: undefined;
            batch?: undefined;
            cacheTime?: undefined;
            ccipRead?: undefined;
            chain?: undefined;
            dataSuffix?: undefined;
            experimental_blockTag?: undefined;
            key?: undefined;
            name?: undefined;
            pollingInterval?: undefined;
            request?: undefined;
            transport?: undefined;
            type?: undefined;
            uid?: undefined;
        } & viem.ExactPartial<Pick<viem.PublicActions<viem.Transport, viem.Chain | undefined, undefined>, "call" | "createContractEventFilter" | "createEventFilter" | "estimateContractGas" | "estimateGas" | "getBlock" | "getBlockNumber" | "getChainId" | "getContractEvents" | "getEnsText" | "getFilterChanges" | "getGasPrice" | "getLogs" | "getTransaction" | "getTransactionCount" | "getTransactionReceipt" | "prepareTransactionRequest" | "readContract" | "sendRawTransaction" | "simulateContract" | "uninstallFilter" | "watchBlockNumber" | "watchContractEvent"> & Pick<viem.WalletActions<viem.Chain | undefined, undefined>, "sendTransaction" | "writeContract">>>(fn: (client: viem.Client<viem.Transport, viem.Chain | undefined, undefined, viem.PublicRpcSchema, viem.PublicActions<viem.Transport, viem.Chain | undefined>>) => client) => viem.Client<viem.Transport, viem.Chain | undefined, undefined, viem.PublicRpcSchema, { [K in keyof client]: client[K]; } & viem.PublicActions<viem.Transport, viem.Chain | undefined>>;
    };
    /** The regime the next swap of this block would see. */
    regime: () => Promise<Regime>;
    /** Report regime changes (trend started/ended/flipped, evidence building, spread engaged/released). */
    watchRegime: (h: Parameters<typeof watchRegime>[2]) => (() => void);
    /** The hook's DetectorSample trace for a block range. */
    history: (fromBlock: bigint, toBlock?: bigint) => Promise<DetectorSample[]>;
    /** Exact-input quote; `amount` in input-token units (USDC to buy, WETH to sell). */
    quote: (side: Side, amount: string | number | bigint) => Promise<Quote>;
    dca: {
        order: (id: bigint) => Promise<DcaOrder | null>;
        ordersOf: (address: Address) => Promise<DcaOrder[]>;
        openOrderIds: () => Promise<bigint[]>;
        preview: (id: bigint) => Promise<SlicePreview>;
        params: (input: DcaOrderInput) => DcaOrderParams;
        /** Unsigned transactions, for any signer. */
        build: {
            create: (from: Address, input: DcaOrderInput) => Promise<TxRequest[]>;
            execute: (id: bigint) => TxRequest;
            cancel: (id: bigint) => TxRequest;
            closeExpired: (id: bigint) => TxRequest;
            pause: (id: bigint) => TxRequest;
            resume: (id: bigint) => TxRequest;
            /** Reads the order, validates the edit like the contract, builds editOrder. */
            edit: (id: bigint, input: DcaEditInput) => Promise<TxRequest>;
        };
        /** Approve (exact amount, if needed) and create; resolves to the new order id. */
        create: (input: DcaOrderInput) => Promise<bigint>;
        execute: (id: bigint) => Promise<TransactionReceipt>;
        cancel: (id: bigint) => Promise<TransactionReceipt>;
        closeExpired: (id: bigint) => Promise<TransactionReceipt>;
        pause: (id: bigint) => Promise<TransactionReceipt>;
        resume: (id: bigint) => Promise<TransactionReceipt>;
        edit: (id: bigint, input: DcaEditInput) => Promise<TransactionReceipt>;
    };
};
type PoincareClient = ReturnType<typeof createPoincareClient>;

export { BPS, DCA_GAS, DCA_STATUS, DCA_STATUS_TEXT, type DcaEditInput, type DcaEditParams, DcaNotDeployedError, type DcaOrder, type DcaOrderInput, type DcaOrderParams, DcaParamError, type DcaStatus, type DetectorSample, FREQUENCIES, FREQUENCY_LABEL, type Frequency, type HookTrend, MAX_SLICES, MIN_INTERVAL, type MarketTrend, PROTECTIONS, PROTECTION_TEXT, type PoincareClient, type PoincareClientOptions, type PoincareDeployment, type Protection, type Quote, type Regime, type RegimeEvent, type RegimeLevel, type Side, type SlicePlan, type SlicePreview, TOKEN_DECIMALS, type TrendOnset, type TxRequest, TxRevertedError, UNICHAIN_SEPOLIA, WAD, allowanceFor, buildApproveTx, buildCancelTx, buildCloseExpiredTx, buildCreateOrderTx, buildEditParams, buildEditTx, buildExecuteSliceTx, buildOrderParams, buildPauseTx, buildResumeTx, classify, createPoincareClient, dcaAbi, decimalToWad, diffRegime, erc20Abi, formatAmount, fromWad, getOpenOrderIds, getOrder, getOrdersOf, hookAbi, lensAbi, limitToMinPriceWad, marketTrend, minPriceWadToLimit, orderIdFromReceipt, planCreateOrder, planSlice, previewSlice, progressOf, quoteExactInput, readRegime, recurringOrder, regimeHistory, requireDca, sendTx, sideToZeroForOne, sliceAmount, slotInfo, spentOf, statusOf, toAmount, toDcaOrder, toRegime, trendOnsets, twapOrder, twapSlices, validateOrderParams, wadToBpsUp, watchRegime, withDca, withTrendSide, zeroForOneToSide };

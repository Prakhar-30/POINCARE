// Generated from packages/sdk (pnpm --dir packages/sdk sync:frontend). Do not edit by hand.
// src/abi/hook.ts
var hookAbi = [
  {
    "type": "function",
    "name": "adaptive",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "currentFeeWad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cusumState",
    "inputs": [],
    "outputs": [
      {
        "name": "sPos",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "sNeg",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dFloor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dMax",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "directionalEfficiency",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "effectiveSpread",
    "inputs": [
      {
        "name": "zeroForOne",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "k",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "kappa",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "kappaMax",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "kappaMin",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lambda",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastSampledBlock",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastSampledPriceWad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolKey",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PoolKey",
        "components": [
          {
            "name": "currency0",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "currency1",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "fee",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "hooks",
            "type": "address",
            "internalType": "contract IHooks"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewDetector",
    "inputs": [],
    "outputs": [
      {
        "name": "s",
        "type": "tuple",
        "internalType": "struct PoincareHook.DetectorSnap",
        "components": [
          {
            "name": "advanced",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "hasReturn",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "priceWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "r",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "sPos",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "sNeg",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "ewmaNet",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "ewmaTV",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "d",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sigma",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "kappa",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "trend",
            "type": "uint8",
            "internalType": "enum Cusum.Trend"
          },
          {
            "name": "offsetA",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "offsetB",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "mid",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewSpread",
    "inputs": [
      {
        "name": "zeroForOne",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "spreadWad",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "feeWad",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reserves",
    "inputs": [],
    "outputs": [
      {
        "name": "r0",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "r1",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sMax",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sigmaWad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "thresholdH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "trend",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum Cusum.Trend"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "DetectorSample",
    "inputs": [
      {
        "name": "blockNumber",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "priceWad",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "r",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "sPos",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "sNeg",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "dWad",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "sigmaWad",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "kappaWad",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "trend",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum Cusum.Trend"
      },
      {
        "name": "feeWad",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
];

// src/abi/lens.ts
var lensAbi = [
  {
    "type": "function",
    "name": "effectivePriceWad",
    "inputs": [
      {
        "name": "zeroForOne",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hook",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PoincareHook"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "midPriceWad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteExactInput",
    "inputs": [
      {
        "name": "zeroForOne",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteExactOutput",
    "inputs": [
      {
        "name": "zeroForOne",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountIn",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "snapshot",
    "inputs": [],
    "outputs": [
      {
        "name": "reserve0",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserve1",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "kappa",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "trend",
        "type": "uint8",
        "internalType": "enum Cusum.Trend"
      },
      {
        "name": "directionalEfficiency",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sPos",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "sNeg",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "thresholdH",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "sigmaWad",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "baseFeeWad",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "spreads",
    "inputs": [],
    "outputs": [
      {
        "name": "spreadZeroForOne",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "spreadOneForZero",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  }
];

// src/abi/dca.ts
var dcaAbi = [
  {
    "type": "function",
    "name": "MAX_SLICES",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_INTERVAL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "canExecute",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PoincareDCA.Preview",
        "components": [
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum PoincareDCA.Status"
          },
          {
            "name": "amountIn",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quoteOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "spreadBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "slot",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "nextSlotAt",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "refunded",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "closeExpired",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "refunded",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createOrder",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct PoincareDCA.OrderParams",
        "components": [
          {
            "name": "zeroForOne",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "amountIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "slices",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "interval",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxSpreadBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "pauseOnTrend",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "catchUp",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxSlippageBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minPriceWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "editOrder",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct PoincareDCA.EditParams",
        "components": [
          {
            "name": "slices",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "interval",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxSpreadBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "pauseOnTrend",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "catchUp",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxSlippageBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minPriceWad",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeSlice",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "amountOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getOrder",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PoincareDCA.Order",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "zeroForOne",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "pauseOnTrend",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "catchUp",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "cancelled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "paused",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxSpreadBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxSlippageBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "slices",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "interval",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "filled",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "scheduleFilled",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lastSlotPlusOne",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "amountIn",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "scheduleBudget",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "remaining",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "amountOut",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "minPriceWad",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hook",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PoincareHook"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isKeeper",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lens",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PoincareLens"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextOrderId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openOrderCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openOrders",
    "inputs": [
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ordersOf",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolTickSpacing",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int24",
        "internalType": "int24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resume",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "router",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IUniswapV4Router04"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setKeeper",
    "inputs": [
      {
        "name": "keeper",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "token0",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token1",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "KeeperSet",
    "inputs": [
      {
        "name": "keeper",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderCancelled",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "refunded",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderCreated",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "zeroForOne",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "slices",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "interval",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "startTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderEdited",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "slices",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "interval",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "startTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderExpired",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "refunded",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderFilled",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderPaused",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderResumed",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SliceExecuted",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "slot",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "amountIn",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "amountOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "spreadBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "filled",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "remaining",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressInsufficientBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AlreadyInState",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedInnerCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidParams",
    "inputs": [
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotExecutable",
    "inputs": [
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum PoincareDCA.Status"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OrderClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnknownOrder",
    "inputs": []
  }
];

// src/abi/erc20.ts
var erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
];

// src/deployments.ts
import { getAddress } from "viem";
var TOKEN_DECIMALS = 18;
var UNICHAIN_SEPOLIA = {
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
  dcaDeployBlock: 67077212n
};
function withDca(dep, dca, dcaDeployBlock) {
  return { ...dep, dca: getAddress(dca), dcaDeployBlock };
}
var DcaNotDeployedError = class extends Error {
  constructor(chain) {
    super(`PoincareDCA is not deployed on ${chain} yet: pass its address with withDca(deployment, address).`);
    this.name = "DcaNotDeployedError";
  }
};
function requireDca(dep) {
  if (!dep.dca) throw new DcaNotDeployedError(dep.name);
  return dep.dca;
}

// src/units.ts
import { formatUnits, parseUnits } from "viem";
var WAD = 10n ** 18n;
var BPS = 10000n;
var fromWad = (x) => Number(formatUnits(x, 18));
var wadToBpsUp = (x) => Number((x * BPS + WAD - 1n) / WAD);
function decimalToWad(v) {
  const s = typeof v === "number" ? numberToPlain(v) : v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative decimal: ${v}`);
  return parseUnits(s, 18);
}
function toAmount(v, decimals = TOKEN_DECIMALS) {
  if (typeof v === "bigint") return v;
  const s = typeof v === "number" ? numberToPlain(v) : v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative amount: ${v}`);
  return parseUnits(s, decimals);
}
var formatAmount = (v, decimals = TOKEN_DECIMALS) => formatUnits(v, decimals);
function numberToPlain(n) {
  if (!Number.isFinite(n) || n < 0) throw new Error(`not a non-negative finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const fixed = n.toFixed(18);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
}

// src/regime.ts
var sideToZeroForOne = (side) => side === "buy";
var zeroForOneToSide = (zeroForOne) => zeroForOne ? "buy" : "sell";
function marketTrend(t) {
  return t === 1 ? "down" : t === 2 ? "up" : "none";
}
function withTrendSide(t) {
  return t === 1 ? "sell" : t === 2 ? "buy" : null;
}
function classify(progress, kappa) {
  if (kappa > 0) return "engaged";
  if (progress >= 0.6) return "building";
  return "calm";
}
async function readRegime(client, dep, opts = {}) {
  const at = opts.blockNumber ?? await client.getBlockNumber();
  const hook = { address: dep.hook, abi: hookAbi };
  const [snap, buy, sell, thresholdH, dFloor, kappaMax, mid] = await Promise.all([
    client.readContract({ ...hook, functionName: "previewDetector", blockNumber: at }),
    client.readContract({ ...hook, functionName: "previewSpread", args: [true], blockNumber: at }),
    client.readContract({ ...hook, functionName: "previewSpread", args: [false], blockNumber: at }),
    client.readContract({ ...hook, functionName: "thresholdH", blockNumber: at }),
    client.readContract({ ...hook, functionName: "dFloor", blockNumber: at }),
    client.readContract({ ...hook, functionName: "kappaMax", blockNumber: at }),
    client.readContract({ address: dep.lens, abi: lensAbi, functionName: "midPriceWad", blockNumber: at })
  ]);
  return toRegime(at, snap, buy, sell, thresholdH, dFloor, kappaMax, mid);
}
function toRegime(blockNumber, snap, buy, sell, thresholdH, dFloor, kappaMax, midPriceWad) {
  const hookTrend = snap.trend;
  const h = thresholdH > 0n ? fromWad(thresholdH) : 0;
  const up = fromWad(snap.sNeg > 0n ? snap.sNeg : 0n);
  const down = fromWad(snap.sPos > 0n ? snap.sPos : 0n);
  const progress = h > 0 ? Math.min(1, Math.max(up, down) / h) : 0;
  const kappa = fromWad(snap.kappa);
  const spreadBuy = buy[0];
  const spreadSell = sell[0];
  return {
    blockNumber,
    price: midPriceWad > 0n ? fromWad(WAD * WAD / midPriceWad) : 0,
    trend: marketTrend(hookTrend),
    level: classify(progress, kappa),
    gated: snap.d < dFloor,
    evidence: { up, down, threshold: h, progress },
    withTrendSide: withTrendSide(hookTrend),
    chargedSide: spreadBuy > 0n ? "buy" : spreadSell > 0n ? "sell" : null,
    spread: { buy: fromWad(spreadBuy), sell: fromWad(spreadSell) },
    kappa,
    kappaMax: fromWad(kappaMax),
    fee: fromWad(buy[1]),
    sigma: fromWad(snap.sigma),
    directionalEfficiency: fromWad(snap.d),
    dFloor: fromWad(dFloor),
    raw: {
      hookTrend,
      sPos: snap.sPos,
      sNeg: snap.sNeg,
      thresholdH,
      kappa: snap.kappa,
      spreadBuy,
      spreadSell,
      feeWad: buy[1],
      midPriceWad
    }
  };
}
function diffRegime(prev, next) {
  const ev = [];
  const at = next.blockNumber;
  const before = prev?.trend ?? "none";
  if (before === "none" && next.trend !== "none") {
    ev.push({ type: "trend-started", trend: next.trend, withTrendSide: next.withTrendSide, blockNumber: at });
  } else if (before !== "none" && next.trend === "none") {
    ev.push({ type: "trend-ended", previous: before, blockNumber: at });
  } else if (before !== "none" && next.trend !== "none" && before !== next.trend) {
    ev.push({ type: "trend-flipped", from: before, to: next.trend, withTrendSide: next.withTrendSide, blockNumber: at });
  }
  const wasBuilding = prev ? prev.level === "building" : false;
  if (next.level === "building" && !wasBuilding) {
    ev.push({
      type: "evidence-building",
      direction: next.evidence.up >= next.evidence.down ? "up" : "down",
      progress: next.evidence.progress,
      gated: next.gated,
      blockNumber: at
    });
  }
  for (const side of ["buy", "sell"]) {
    const was = prev ? prev.spread[side] > 0 : false;
    const is = next.spread[side] > 0;
    if (!was && is) ev.push({ type: "spread-engaged", side, spread: next.spread[side], blockNumber: at });
    if (was && !is) ev.push({ type: "spread-released", side, blockNumber: at });
  }
  return ev;
}
function watchRegime(client, dep, handlers) {
  let prev = null;
  let busy = false;
  return client.watchBlockNumber({
    emitOnBegin: true,
    pollingInterval: handlers.pollingInterval ?? 4e3,
    onError: handlers.onError,
    onBlockNumber: async (blockNumber) => {
      if (busy) return;
      busy = true;
      try {
        const next = await readRegime(client, dep, { blockNumber });
        handlers.onRegime?.(next);
        for (const e of diffRegime(prev, next)) handlers.onEvent?.(e, next);
        prev = next;
      } catch (err) {
        handlers.onError?.(err);
      } finally {
        busy = false;
      }
    }
  });
}
var detectorSampleEvent = hookAbi.find((x) => x.type === "event" && x.name === "DetectorSample");
async function regimeHistory(client, dep, opts) {
  const to = opts.toBlock ?? await client.getBlockNumber();
  const chunk = opts.chunk ?? 1000n;
  const out = [];
  for (let from = opts.fromBlock; from <= to; from += chunk) {
    const end = from + chunk - 1n > to ? to : from + chunk - 1n;
    const logs = await client.getLogs({ address: dep.hook, event: detectorSampleEvent, fromBlock: from, toBlock: end });
    for (const l of logs) {
      const a = l.args;
      out.push({
        blockNumber: a.blockNumber,
        price: a.priceWad > 0n ? fromWad(WAD * WAD / a.priceWad) : 0,
        trend: marketTrend(a.trend),
        evidenceUp: fromWad(a.sNeg > 0n ? a.sNeg : 0n),
        evidenceDown: fromWad(a.sPos > 0n ? a.sPos : 0n),
        kappa: fromWad(a.kappaWad),
        directionalEfficiency: fromWad(a.dWad),
        sigma: fromWad(a.sigmaWad),
        fee: fromWad(a.feeWad)
      });
    }
  }
  return out;
}
function trendOnsets(samples) {
  const out = [];
  let prev = "none";
  for (const s of samples) {
    if (s.trend !== prev) {
      const type = prev === "none" ? "start" : s.trend === "none" ? "end" : "flip";
      out.push({ blockNumber: s.blockNumber, type, trend: s.trend, price: s.price });
      prev = s.trend;
    }
  }
  return out;
}

// src/quote.ts
async function quoteExactInput(client, dep, side, amountIn) {
  const zeroForOne = sideToZeroForOne(side);
  const [amountOut, [spreadWad, feeWad]] = await Promise.all([
    client.readContract({ address: dep.lens, abi: lensAbi, functionName: "quoteExactInput", args: [zeroForOne, amountIn] }),
    client.readContract({ address: dep.hook, abi: hookAbi, functionName: "previewSpread", args: [zeroForOne] })
  ]);
  const usdc = side === "buy" ? amountIn : amountOut;
  const weth = side === "buy" ? amountOut : amountIn;
  return {
    side,
    amountIn,
    amountOut,
    price: weth > 0n ? Number(usdc) / Number(weth) : 0,
    spread: fromWad(spreadWad),
    fee: fromWad(feeWad)
  };
}

// src/dca.ts
import { getAddress as getAddress2 } from "viem";
var DCA_STATUS = [
  "ready",
  "unknown",
  "cancelled",
  "filled",
  "expired",
  "not-started",
  "waiting-for-slot",
  "spread-too-high",
  "trend-against",
  "below-limit",
  "paused"
];
var DCA_STATUS_TEXT = {
  ready: "The next slice can fill now.",
  unknown: "No such order.",
  cancelled: "The order was cancelled; its remaining budget was refunded.",
  filled: "The order is complete.",
  expired: "The deadline passed; the unfilled budget can be refunded to the owner.",
  "not-started": "The order has not reached its start time.",
  "waiting-for-slot": "This slot is already filled; the next slice opens at the next slot.",
  "spread-too-high": "The trend spread on this order's side is above its cap; the slice is held.",
  "trend-against": "A trend runs with this order's side (the side the pool charges); the order is paused until it ends.",
  "below-limit": "The pool price is worse than the order's limit price.",
  paused: "The owner paused the order; no slice fills until it is resumed."
};
var statusOf = (code) => DCA_STATUS[code] ?? "unknown";
var MIN_INTERVAL = 60;
var MAX_SLICES = 1e4;
var DcaParamError = class extends Error {
  /** The same reason string PoincareDCA reverts with. */
  reason;
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "DcaParamError";
    this.reason = reason;
  }
};
var ZERO = "0x0000000000000000000000000000000000000000";
function limitToMinPriceWad(side, limitPrice) {
  const p = decimalToWad(limitPrice);
  if (p === 0n) throw new DcaParamError("limitPrice", "must be above zero");
  return side === "buy" ? WAD * WAD / p : p;
}
function minPriceWadToLimit(side, minPriceWad) {
  if (minPriceWad === 0n) return null;
  const v = side === "buy" ? WAD * WAD / minPriceWad : minPriceWad;
  return Number(v) / 1e18;
}
function buildOrderParams(input, nowSec = Math.floor(Date.now() / 1e3)) {
  const now = BigInt(nowSec);
  const startTime = input.startTime === void 0 ? 0n : BigInt(input.startTime);
  const effectiveStart = startTime === 0n ? now : startTime;
  const slices = input.slices;
  const interval = input.interval;
  const deadline = input.deadline !== void 0 ? BigInt(input.deadline) : input.duration !== void 0 ? effectiveStart + BigInt(Math.max(0, Math.trunc(input.duration))) : effectiveStart + BigInt(Math.max(0, slices)) * BigInt(interval);
  const p = {
    zeroForOne: sideToZeroForOne(input.side),
    amountIn: toAmount(input.amount),
    slices,
    interval,
    startTime,
    deadline,
    maxSpreadBps: input.maxSpreadBps ?? 1e4,
    pauseOnTrend: input.pauseOnTrend ?? false,
    catchUp: input.catchUp ?? true,
    maxSlippageBps: input.maxSlippageBps ?? 50,
    minPriceWad: input.limitPrice === void 0 ? 0n : limitToMinPriceWad(input.side, input.limitPrice),
    recipient: input.recipient ? getAddress2(input.recipient) : ZERO
  };
  validateOrderParams(p, now);
  return p;
}
function validateOrderParams(p, nowSec, dca) {
  const start = p.startTime === 0n ? nowSec : p.startTime;
  if (p.amountIn <= 0n) throw new DcaParamError("amountIn");
  if (!Number.isInteger(p.slices) || p.slices <= 0 || p.slices > MAX_SLICES) throw new DcaParamError("slices", `1..${MAX_SLICES}`);
  if (p.amountIn < BigInt(p.slices)) throw new DcaParamError("amountIn below slices");
  if (!Number.isInteger(p.interval) || p.interval < MIN_INTERVAL) throw new DcaParamError("interval", `at least ${MIN_INTERVAL}s`);
  if (start < nowSec) throw new DcaParamError("startTime", "in the past");
  if (!inBps(p.maxSpreadBps) || !inBps(p.maxSlippageBps)) throw new DcaParamError("bps", "0..10000");
  if (dca && p.recipient.toLowerCase() === dca.toLowerCase()) throw new DcaParamError("recipient");
  const lastPlanned = start + BigInt(p.slices - 1) * BigInt(p.interval);
  if (p.deadline <= lastPlanned) throw new DcaParamError("deadline", "every slice must open before the deadline");
}
var inBps = (v) => Number.isInteger(v) && v >= 0 && v <= 1e4;
function toDcaOrder(id, o) {
  return { ...o, id, side: zeroForOneToSide(o.zeroForOne) };
}
function slotInfo(o, now) {
  const interval = BigInt(o.interval);
  const lastSlot = o.deadline > o.startTime ? (o.deadline - o.startTime - 1n) / interval : 0n;
  let slot = now >= o.startTime ? (now - o.startTime) / interval : 0n;
  if (slot > lastSlot) slot = lastSlot;
  const next = o.startTime + (slot + 1n) * interval;
  return { slot, lastSlot, nextSlotAt: now < o.startTime ? o.startTime : next < o.deadline ? next : 0n };
}
function sliceAmount(o, slot, lastSlot) {
  const base = o.scheduleBudget / BigInt(o.slices);
  let amt = base;
  if (o.catchUp) {
    const slotsLeft = lastSlot - slot + 1n;
    const even = (o.remaining + slotsLeft - 1n) / slotsLeft;
    if (even > amt) amt = even;
  }
  if (o.scheduleFilled + 1 >= o.slices || amt > o.remaining) amt = o.remaining;
  return amt;
}
function buildEditParams(o, input, nowSec = Math.floor(Date.now() / 1e3)) {
  const now = BigInt(nowSec);
  if (o.cancelled || o.remaining === 0n) throw new DcaParamError("closed", "the order is no longer open");
  const slices = input.slices ?? o.slices;
  const interval = input.interval ?? o.interval;
  const startTime = input.startTime === void 0 ? 0n : BigInt(input.startTime);
  const start = startTime === 0n ? now : startTime;
  const deadline = input.deadline !== void 0 ? BigInt(input.deadline) : input.duration !== void 0 ? start + BigInt(Math.max(0, Math.trunc(input.duration))) : start + BigInt(Math.max(0, slices)) * BigInt(interval);
  const p = {
    slices,
    interval,
    startTime,
    deadline,
    maxSpreadBps: input.maxSpreadBps ?? o.maxSpreadBps,
    pauseOnTrend: input.pauseOnTrend ?? o.pauseOnTrend,
    catchUp: input.catchUp ?? o.catchUp,
    maxSlippageBps: input.maxSlippageBps ?? o.maxSlippageBps,
    minPriceWad: input.limitPrice === void 0 ? o.minPriceWad : input.limitPrice === null ? 0n : limitToMinPriceWad(o.side, input.limitPrice)
  };
  validateOrderParams(
    {
      zeroForOne: o.zeroForOne,
      amountIn: o.remaining,
      slices: p.slices,
      interval: p.interval,
      startTime: p.startTime,
      deadline: p.deadline,
      maxSpreadBps: p.maxSpreadBps,
      pauseOnTrend: p.pauseOnTrend,
      catchUp: p.catchUp,
      maxSlippageBps: p.maxSlippageBps,
      minPriceWad: p.minPriceWad,
      recipient: o.recipient
    },
    now
  );
  return p;
}
function planSlice(o, ctx) {
  const plan = { status: "ready", amountIn: 0n, minOut: 0n, slot: 0n, nextSlotAt: 0n };
  const done = (status) => ({ ...plan, status });
  if (o.cancelled) return done("cancelled");
  if (o.remaining === 0n) return done("filled");
  if (ctx.now > o.deadline) return done("expired");
  if (o.paused) return done("paused");
  if (ctx.now < o.startTime) return { ...done("not-started"), nextSlotAt: o.startTime };
  const { slot, lastSlot, nextSlotAt } = slotInfo(o, ctx.now);
  plan.slot = slot;
  plan.nextSlotAt = nextSlotAt;
  plan.amountIn = sliceAmount(o, slot, lastSlot);
  if (o.lastSlotPlusOne > slot) return done("waiting-for-slot");
  if (ctx.spreadBps > o.maxSpreadBps) return done("spread-too-high");
  if (o.pauseOnTrend && ctx.trendWithSide) return done("trend-against");
  if (ctx.quoteOut === void 0) return plan;
  const limitOut = o.minPriceWad === 0n ? 0n : (plan.amountIn * o.minPriceWad + WAD - 1n) / WAD;
  if (ctx.quoteOut < limitOut) return done("below-limit");
  const slipOut = ctx.quoteOut * (BPS - BigInt(o.maxSlippageBps)) / BPS;
  plan.minOut = limitOut > slipOut ? limitOut : slipOut;
  return plan;
}
var progressOf = (o) => o.amountIn === 0n ? 0 : Number((o.amountIn - o.remaining) * 10000n / o.amountIn) / 1e4;

// src/plans.ts
var FREQUENCIES = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800
};
var FREQUENCY_LABEL = {
  "5m": "Every 5 min",
  "15m": "Every 15 min",
  "1h": "Hourly",
  "4h": "Every 4 hours",
  "1d": "Daily",
  "1w": "Weekly"
};
var PROTECTIONS = {
  /** Skip a buy while this side pays the trend spread; later buys make it up. The Poincaré default. */
  "spread-guard": { maxSpreadBps: 0, pauseOnTrend: false, catchUp: true },
  /** Also hold while a trend runs with this side, before the spread has even ramped. */
  "trend-pause": { maxSpreadBps: 0, pauseOnTrend: true, catchUp: true },
  /** Buy every period whatever the spread, like a plain recurring buy. */
  "always": { maxSpreadBps: 1e4, pauseOnTrend: false, catchUp: true }
};
var PROTECTION_TEXT = {
  "spread-guard": {
    title: "Spread guard",
    detail: "Never pays the trend spread. A fill that would pay it waits, and later fills catch up so the plan still finishes."
  },
  "trend-pause": {
    title: "Trend pause",
    detail: "Also waits while a trend runs in your direction, before any spread is charged. Most patient."
  },
  always: {
    title: "Always fill",
    detail: "Fills every period whatever the spread, like a plain recurring order on an exchange."
  }
};
function recurringOrder(r) {
  const interval = typeof r.frequency === "number" ? r.frequency : FREQUENCIES[r.frequency];
  const per = toAmount(r.amountPerBuy);
  return {
    side: r.side,
    amount: per * BigInt(Math.max(0, Math.trunc(r.count))),
    slices: r.count,
    interval,
    startTime: r.startTime,
    ...PROTECTIONS[r.protection ?? "spread-guard"],
    limitPrice: r.limitPrice,
    maxSlippageBps: r.maxSlippageBps,
    recipient: r.recipient
  };
}
function twapOrder(t) {
  const slices = t.slices ?? twapSlices(t.durationSec);
  const interval = Math.max(60, Math.floor(t.durationSec / slices));
  return {
    side: t.side,
    amount: t.total,
    slices,
    interval,
    startTime: t.startTime,
    duration: t.durationSec,
    ...PROTECTIONS[t.protection ?? "spread-guard"],
    limitPrice: t.limitPrice,
    maxSlippageBps: t.maxSlippageBps,
    recipient: t.recipient
  };
}
function twapSlices(durationSec) {
  return Math.min(48, Math.max(2, Math.round(durationSec / 300)));
}

// src/dcaClient.ts
import {
  encodeFunctionData,
  parseEventLogs
} from "viem";
var DCA_GAS = {
  approve: 80000n,
  createOrder: 450000n,
  executeSlice: 1500000n,
  cancel: 200000n,
  closeExpired: 200000n,
  pause: 80000n,
  resume: 80000n,
  editOrder: 150000n
};
var inputToken = (dep, side) => side === "buy" ? dep.usdc : dep.weth;
async function getOrder(client, dep, id) {
  const o = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "getOrder", args: [id] });
  if (o.owner === "0x0000000000000000000000000000000000000000") return null;
  return toDcaOrder(id, o);
}
async function getOrdersOf(client, dep, owner) {
  const ids = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "ordersOf", args: [owner] });
  const orders = await Promise.all(ids.map((id) => getOrder(client, dep, id)));
  return orders.filter((o) => o !== null);
}
async function getOpenOrderIds(client, dep, pageSize = 200n) {
  const dca = requireDca(dep);
  const total = await client.readContract({ address: dca, abi: dcaAbi, functionName: "openOrderCount" });
  const ids = [];
  for (let off = 0n; off < total; off += pageSize) {
    ids.push(...await client.readContract({ address: dca, abi: dcaAbi, functionName: "openOrders", args: [off, pageSize] }));
  }
  return ids;
}
async function previewSlice(client, dep, id) {
  const p = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "canExecute", args: [id] });
  return {
    status: statusOf(p.status),
    amountIn: p.amountIn,
    quoteOut: p.quoteOut,
    minOut: p.minOut,
    spreadBps: Number(p.spreadBps),
    slot: p.slot,
    nextSlotAt: p.nextSlotAt
  };
}
async function allowanceFor(client, dep, owner, side, atBlock) {
  const read = (blockNumber) => client.readContract({ address: inputToken(dep, side), abi: erc20Abi, functionName: "allowance", args: [owner, requireDca(dep)], blockNumber });
  if (atBlock === void 0) return read();
  for (let attempt = 1; ; attempt++) {
    try {
      return await read(atBlock);
    } catch (e) {
      if (attempt >= 10) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
function buildApproveTx(dep, side, amount) {
  return {
    to: inputToken(dep, side),
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [requireDca(dep), amount] }),
    value: 0n,
    gas: DCA_GAS.approve,
    description: `Approve ${side === "buy" ? "USDC" : "WETH"} for the DCA contract`
  };
}
function buildCreateOrderTx(dep, p) {
  return {
    to: requireDca(dep),
    data: encodeFunctionData({
      abi: dcaAbi,
      functionName: "createOrder",
      args: [{
        zeroForOne: p.zeroForOne,
        amountIn: p.amountIn,
        slices: p.slices,
        interval: p.interval,
        startTime: p.startTime,
        deadline: p.deadline,
        maxSpreadBps: p.maxSpreadBps,
        pauseOnTrend: p.pauseOnTrend,
        catchUp: p.catchUp,
        maxSlippageBps: p.maxSlippageBps,
        minPriceWad: p.minPriceWad,
        recipient: p.recipient
      }]
    }),
    value: 0n,
    gas: DCA_GAS.createOrder,
    description: `Create a DCA order (${p.slices} slices)`
  };
}
var simple = (fn, label) => (dep, id) => ({
  to: requireDca(dep),
  data: encodeFunctionData({ abi: dcaAbi, functionName: fn, args: [id] }),
  value: 0n,
  gas: DCA_GAS[fn],
  description: `${label} DCA order #${id}`
});
var buildExecuteSliceTx = simple("executeSlice", "Fill a slice of");
var buildCancelTx = simple("cancel", "Cancel");
var buildPauseTx = simple("pause", "Pause");
var buildResumeTx = simple("resume", "Resume");
function buildEditTx(dep, id, p) {
  return {
    to: requireDca(dep),
    data: encodeFunctionData({
      abi: dcaAbi,
      functionName: "editOrder",
      args: [id, {
        slices: p.slices,
        interval: p.interval,
        startTime: p.startTime,
        deadline: p.deadline,
        maxSpreadBps: p.maxSpreadBps,
        pauseOnTrend: p.pauseOnTrend,
        catchUp: p.catchUp,
        maxSlippageBps: p.maxSlippageBps,
        minPriceWad: p.minPriceWad
      }]
    }),
    value: 0n,
    gas: DCA_GAS.editOrder,
    description: `Edit DCA order #${id} (${p.slices} slices)`
  };
}
var buildCloseExpiredTx = simple("closeExpired", "Refund expired");
async function planCreateOrder(client, dep, owner, p, opts = {}) {
  const side = p.zeroForOne ? "buy" : "sell";
  const allowance = await allowanceFor(client, dep, owner, side, opts.atBlock);
  return [...allowance < p.amountIn ? [buildApproveTx(dep, side, p.amountIn)] : [], buildCreateOrderTx(dep, p)];
}
var TxRevertedError = class extends Error {
  constructor(hash) {
    super(`transaction ${hash} reverted`);
    this.hash = hash;
    this.name = "TxRevertedError";
  }
  hash;
};
async function sendTx(wallet, client, tx, opts = {}) {
  const account = opts.account ?? wallet.account;
  if (!account) throw new Error("the wallet client has no account");
  const hash = await wallet.sendTransaction({
    account,
    chain: opts.chain ?? wallet.chain ?? null,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    gas: tx.gas
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new TxRevertedError(hash);
  return receipt;
}
function orderIdFromReceipt(dep, receipt) {
  const dca = requireDca(dep).toLowerCase();
  const logs = parseEventLogs({ abi: dcaAbi, eventName: "OrderCreated", logs: receipt.logs.filter((l) => l.address.toLowerCase() === dca) });
  if (!logs.length) throw new Error("no OrderCreated event in this receipt");
  return logs[0].args.id;
}

// src/client.ts
import { createPublicClient, http } from "viem";
import { unichainSepolia } from "viem/chains";
function createPoincareClient(opts = {}) {
  const deployment = opts.deployment ?? UNICHAIN_SEPOLIA;
  const publicClient = opts.publicClient ?? createPublicClient({ chain: unichainSepolia, transport: http(opts.rpcUrl ?? deployment.rpcUrl) });
  const wallet = opts.walletClient;
  const needWallet = () => {
    if (!wallet) throw new Error("this call sends a transaction: pass walletClient to createPoincareClient");
    return wallet;
  };
  let lastBlock;
  const send = async (tx) => {
    const r = await sendTx(needWallet(), publicClient, tx);
    if (lastBlock === void 0 || r.blockNumber > lastBlock) lastBlock = r.blockNumber;
    return r;
  };
  const owner = () => {
    const a = needWallet().account?.address;
    if (!a) throw new Error("the wallet client has no account");
    return a;
  };
  return {
    deployment,
    publicClient,
    /** The regime the next swap of this block would see. */
    regime: () => readRegime(publicClient, deployment),
    /** Report regime changes (trend started/ended/flipped, evidence building, spread engaged/released). */
    watchRegime: (h) => watchRegime(publicClient, deployment, h),
    /** The hook's DetectorSample trace for a block range. */
    history: (fromBlock, toBlock) => regimeHistory(publicClient, deployment, { fromBlock, toBlock }),
    /** Exact-input quote; `amount` in input-token units (USDC to buy, WETH to sell). */
    quote: (side, amount) => quoteExactInput(publicClient, deployment, side, toAmount(amount)),
    dca: {
      order: (id) => getOrder(publicClient, deployment, id),
      ordersOf: (address) => getOrdersOf(publicClient, deployment, address),
      openOrderIds: () => getOpenOrderIds(publicClient, deployment),
      preview: (id) => previewSlice(publicClient, deployment, id),
      params: (input) => buildOrderParams(input),
      /** Unsigned transactions, for any signer. */
      build: {
        create: (from, input) => planCreateOrder(publicClient, deployment, from, buildOrderParams(input)),
        execute: (id) => buildExecuteSliceTx(deployment, id),
        cancel: (id) => buildCancelTx(deployment, id),
        closeExpired: (id) => buildCloseExpiredTx(deployment, id),
        pause: (id) => buildPauseTx(deployment, id),
        resume: (id) => buildResumeTx(deployment, id),
        /** Reads the order, validates the edit like the contract, builds editOrder. */
        edit: async (id, input) => {
          const o = await getOrder(publicClient, deployment, id);
          if (!o) throw new Error(`no DCA order #${id}`);
          return buildEditTx(deployment, id, buildEditParams(o, input));
        }
      },
      /** Approve (exact amount, if needed) and create; resolves to the new order id. */
      create: async (input) => {
        const txs = await planCreateOrder(publicClient, deployment, owner(), buildOrderParams(input), { atBlock: lastBlock });
        let receipt;
        for (const tx of txs) receipt = await send(tx);
        return orderIdFromReceipt(deployment, receipt);
      },
      execute: (id) => send(buildExecuteSliceTx(deployment, id)),
      cancel: (id) => send(buildCancelTx(deployment, id)),
      closeExpired: (id) => send(buildCloseExpiredTx(deployment, id)),
      pause: (id) => send(buildPauseTx(deployment, id)),
      resume: (id) => send(buildResumeTx(deployment, id)),
      edit: async (id, input) => {
        const o = await getOrder(publicClient, deployment, id);
        if (!o) throw new Error(`no DCA order #${id}`);
        return send(buildEditTx(deployment, id, buildEditParams(o, input)));
      }
    }
  };
}
export {
  BPS,
  DCA_GAS,
  DCA_STATUS,
  DCA_STATUS_TEXT,
  DcaNotDeployedError,
  DcaParamError,
  FREQUENCIES,
  FREQUENCY_LABEL,
  MAX_SLICES,
  MIN_INTERVAL,
  PROTECTIONS,
  PROTECTION_TEXT,
  TOKEN_DECIMALS,
  TxRevertedError,
  UNICHAIN_SEPOLIA,
  WAD,
  allowanceFor,
  buildApproveTx,
  buildCancelTx,
  buildCloseExpiredTx,
  buildCreateOrderTx,
  buildEditParams,
  buildEditTx,
  buildExecuteSliceTx,
  buildOrderParams,
  buildPauseTx,
  buildResumeTx,
  classify,
  createPoincareClient,
  dcaAbi,
  decimalToWad,
  diffRegime,
  erc20Abi,
  formatAmount,
  fromWad,
  getOpenOrderIds,
  getOrder,
  getOrdersOf,
  hookAbi,
  lensAbi,
  limitToMinPriceWad,
  marketTrend,
  minPriceWadToLimit,
  orderIdFromReceipt,
  planCreateOrder,
  planSlice,
  previewSlice,
  progressOf,
  quoteExactInput,
  readRegime,
  recurringOrder,
  regimeHistory,
  requireDca,
  sendTx,
  sideToZeroForOne,
  sliceAmount,
  slotInfo,
  statusOf,
  toAmount,
  toDcaOrder,
  toRegime,
  trendOnsets,
  twapOrder,
  twapSlices,
  validateOrderParams,
  wadToBpsUp,
  watchRegime,
  withDca,
  withTrendSide,
  zeroForOneToSide
};

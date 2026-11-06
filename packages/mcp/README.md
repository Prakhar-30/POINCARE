# @poincaretrade/mcp

An [MCP](https://modelcontextprotocol.io) server that gives Claude, or any MCP client, **Poincaré**'s trend
regime, swap quotes and spread-aware DCA orders as 15 tools. It reads the live pool on Unichain Sepolia and
returns **unsigned** transactions; nothing is ever sent unless you add your own key and the agent calls a
tool with `send: true`.

Full docs: **https://www.poincaretrade.in/#/developers/mcp**

## Add it

**Claude Code**

```sh
claude mcp add poincare -- npx -y @poincaretrade/mcp
```

**Claude Desktop and other clients** (`mcpServers` in the client's config):

```json
{
  "mcpServers": {
    "poincare": { "command": "npx", "args": ["-y", "@poincaretrade/mcp"] }
  }
}
```

| Variable | Meaning |
|---|---|
| `POINCARE_RPC_URL` | RPC endpoint (default: the public Unichain Sepolia RPC) |
| `POINCARE_DCA_ADDRESS` | Overrides the live PoincareDCA |
| `POINCARE_PRIVATE_KEY` | Optional. With it, tools called with `send: true` broadcast from this key, and owner-only tools refuse orders it does not own. Use a testnet key you are happy to delegate |

## Tools

`get_regime` · `get_regime_history` · `wait_for_regime_change` · `quote` · `dca_plan_order` ·
`dca_create_order` · `dca_get_order` · `dca_list_orders` · `dca_preview_slice` · `dca_pause_order` ·
`dca_resume_order` · `dca_edit_order` · `dca_execute_slice` · `dca_cancel_order` · `dca_close_expired`

Try: *"Is the Poincaré pool trending right now, and which side pays?"* or *"Plan a DCA that buys 500 USDC
of WETH over a day without ever paying the trend spread."*

**Status:** testnet research preview. Licensed under the Business Source License 1.1 (see LICENSE).

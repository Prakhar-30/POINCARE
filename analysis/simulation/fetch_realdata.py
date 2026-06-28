#!/usr/bin/env python3
"""
Fetch ~6 months of real ETH/USDC price history (Binance 4h klines) and write:
  - realdata/eth_usdc_4h.csv   human-readable (iso_time, close_usd)
  - realdata/prices_wad.txt    one WAD-scaled integer per line (close_usd * 1e18),
                               consumed by test/sim/ForkRealData.t.sol

No API key needed (public market-data endpoint).
"""
import urllib.request, json, time, os, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "realdata")
os.makedirs(OUT, exist_ok=True)

SYMBOL = "ETHUSDC"
INTERVAL = "4h"
INTERVAL_MS = 4 * 3600 * 1000
DAYS = 180
BASES = ["https://data-api.binance.vision", "https://api.binance.com"]


def fetch(base, start_ms, end_ms):
    u = f"{base}/api/v3/klines?symbol={SYMBOL}&interval={INTERVAL}&startTime={start_ms}&endTime={end_ms}&limit=1000"
    return json.load(urllib.request.urlopen(u, timeout=30))


def main():
    now = int(time.time() * 1000)
    start = now - DAYS * 24 * 3600 * 1000
    rows = []
    base = None
    for b in BASES:
        try:
            urllib.request.urlopen(f"{b}/api/v3/ping", timeout=15)
            base = b
            break
        except Exception:
            continue
    if base is None:
        raise SystemExit("no Binance endpoint reachable")
    print("using", base)

    cur = start
    while cur < now:
        batch = fetch(base, cur, now)
        if not batch:
            break
        rows.extend(batch)
        last_open = batch[-1][0]
        nxt = last_open + INTERVAL_MS
        if nxt <= cur or len(batch) < 1000:
            # final partial batch
            cur = nxt
            if len(batch) < 1000:
                break
        cur = nxt
        time.sleep(0.15)

    # dedupe by openTime, sort
    seen = {}
    for r in rows:
        seen[r[0]] = r
    klines = [seen[k] for k in sorted(seen)]

    csv_path = os.path.join(OUT, "eth_usdc_4h.csv")
    wad_path = os.path.join(OUT, "prices_wad.txt")
    with open(csv_path, "w") as fcsv, open(wad_path, "w") as fwad:
        fcsv.write("iso_time,close_usd\n")
        for k in klines:
            ot = dt.datetime.utcfromtimestamp(k[0] / 1000).isoformat()
            close = float(k[4])
            fcsv.write(f"{ot},{close:.6f}\n")
            fwad.write(str(int(round(close * 1e18))) + "\n")

    closes = [float(k[4]) for k in klines]
    print(f"symbol={SYMBOL} interval={INTERVAL} points={len(klines)}")
    print(f"range: {dt.datetime.utcfromtimestamp(klines[0][0]/1000).date()} "
          f"-> {dt.datetime.utcfromtimestamp(klines[-1][0]/1000).date()}")
    print(f"price: min={min(closes):.2f} max={max(closes):.2f} "
          f"first={closes[0]:.2f} last={closes[-1]:.2f}")
    print(f"wrote {csv_path}")
    print(f"wrote {wad_path}")


if __name__ == "__main__":
    main()

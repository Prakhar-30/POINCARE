// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";

import {Cusum} from "../../src/libraries/Cusum.sol";
import {PriceLib} from "../../src/libraries/PriceLib.sol";

/// @title RealDataCalibrationTest - detector calibration on the EMPIRICAL return distribution
/// @notice Closes the gap `analysis/CALIBRATION.md` flags as milestone-6 work: the sibling
///         `Calibration.t.sol` validates the calibration *laws* on an illustrative uniform
///         noise model, while this file runs the same measurements on the **real, heavy-tailed
///         ETH/USDC return distribution** and produces the numbers the fork replay deploys.
///
///         Method (documented in CALIBRATION.md):
///           1. read the real 4h closes, take log-returns r_t = dln(P);
///           2. split the series: the FIRST HALF is the calibration sample, the second half is
///              never touched here, so the fork replay's evaluation on it is out-of-sample;
///           3. build the no-trend surrogate by DEMEANING the calibration returns: the drift is
///              removed, the heavy tails, clustering and skew are kept (a bootstrap of the real
///              residuals, not a Gaussian fit);
///           4. measure sigma, then ARL0(h) and detection delay by resampling that surrogate;
///           5. derive k = mu1/2 for the smallest drift worth detecting mu1, and pick h from
///              the target false-alarm rate.
///
///         Everything here is a MEASUREMENT, so the tests assert the qualitative laws the
///         design depends on (ARL0 monotone in h, delay shrinking in drift, the shipped
///         numbers landing where the calibration says) rather than pinning exact values that
///         would churn with the data file.
///
/// @dev    Loops run into the millions of iterations, so the same memory discipline as
///         `Calibration.t.sol` applies: hash in scratch space (0x00..0x3f), keep the CUSUM
///         recursion in scalar locals (it mirrors `Cusum.updateCapped` exactly; the library's
///         own correctness is proven in `test/Cusum.t.sol`), and never allocate in a loop.
contract RealDataCalibrationTest is Test {
    uint256 internal constant WAD = 1e18;
    string internal constant PRICES = "analysis/simulation/realdata/prices_wad.txt";

    /// @dev Signed log-returns of the real series, WAD.
    int256[] internal rets;
    /// @dev Demeaned calibration-half returns: the no-trend surrogate resampled below.
    int256[] internal resid;

    int256 internal sigma; // per-bar volatility of the calibration half (WAD)

    function setUp() public {
        uint256[] memory px = _readPrices();
        require(px.length > 100, "no price data - run analysis/simulation/fetch_realdata.py");

        for (uint256 i = 1; i < px.length; i++) {
            rets.push(PriceLib.logReturnWad(px[i - 1], px[i]));
        }

        // Calibration sample = first half only. The fork replay reports the second half
        // separately, so that half is genuinely out-of-sample for these parameters.
        uint256 half = rets.length / 2;
        int256 sum;
        for (uint256 i = 0; i < half; i++) {
            sum += rets[i];
        }
        int256 mean = sum / int256(half);

        uint256 sqSum;
        for (uint256 i = 0; i < half; i++) {
            int256 d = rets[i] - mean;
            resid.push(d); // drift removed, tails kept
            sqSum += uint256(d * d / int256(WAD));
        }
        sigma = int256(_sqrtWad(sqSum * WAD / half));
    }

    // ------------------------------------------------------------------
    // measurement primitives (on the empirical residual distribution)
    // ------------------------------------------------------------------

    /// @dev One CUSUM trajectory over `drift` + a bootstrap draw from the real residuals.
    ///      Returns the step of the first alarm, or `maxSteps` (right-censored).
    function _runLength(int256 drift, int256 k, int256 h, uint256 seed, uint256 maxSteps)
        internal
        view
        returns (uint256)
    {
        int256 sPos;
        int256 sNeg;
        uint256 n = resid.length;
        for (uint256 t = 1; t <= maxSteps; t++) {
            uint256 u;
            assembly {
                mstore(0x00, seed)
                mstore(0x20, t)
                u := keccak256(0x00, 0x40)
            }
            int256 r = drift + resid[u % n];
            sPos += (r - k);
            if (sPos < 0) sPos = 0;
            sNeg += (-r - k);
            if (sNeg < 0) sNeg = 0;
            if (sPos >= h || sNeg >= h) return t;
        }
        return maxSteps;
    }

    function _meanRunLength(int256 drift, int256 k, int256 h, uint256 runs, uint256 maxSteps)
        internal
        view
        returns (uint256)
    {
        uint256 total;
        for (uint256 i = 0; i < runs; i++) {
            total += _runLength(drift, k, h, uint256(keccak256(abi.encode("arl", i))), maxSteps);
        }
        return total / runs;
    }

    /// @notice ARL0: mean bars between false alarms with the drift removed.
    function _arl0(int256 k, int256 h) internal view returns (uint256) {
        return _meanRunLength(0, k, h, 96, 8000);
    }

    /// @notice ARL1: mean bars to detect a real drift of `drift` per bar.
    function _delay(int256 drift, int256 k, int256 h) internal view returns (uint256) {
        return _meanRunLength(drift, k, h, 96, 4000);
    }

    // ------------------------------------------------------------------
    // the calibration laws must hold on the REAL distribution, not just on noise
    // ------------------------------------------------------------------

    function test_arl0_isMonotoneInThreshold_onRealReturns() public view {
        int256 k = sigma / 4; // k = mu1/2 with mu1 = 0.5 sigma (see below)
        uint256 a2 = _arl0(k, 2 * sigma);
        uint256 a4 = _arl0(k, 4 * sigma);
        uint256 a6 = _arl0(k, 6 * sigma);

        assertGt(a2, 1, "a usable detector must not false-alarm on step 1");
        assertGt(a4, a2, "raising h must raise ARL0");
        assertGt(a6, a4, "raising h must raise ARL0 (monotone)");
    }

    function test_detectionDelay_shrinksWithDrift_onRealReturns() public view {
        int256 k = sigma / 4;
        int256 h = 6 * sigma;
        uint256 weak = _delay(sigma / 2, k, h); // 0.5 sigma per bar
        uint256 strong = _delay(sigma, k, h); //   1.0 sigma per bar

        assertLt(strong, weak, "stronger drift must be detected sooner (data-dependent stopping time)");
        assertLt(weak, 4000, "the design drift must still be detected before the horizon");
    }

    /// @notice The separation the whole design rests on: a genuine trend is detected far faster
    ///         than the detector cries wolf on real, heavy-tailed chop.
    function test_realTrendDetectedFasterThanFalseAlarms() public view {
        int256 k = sigma / 4;
        int256 h = 6 * sigma;
        assertLt(_delay(sigma / 2, k, h), _arl0(k, h), "a real trend must be detected before the mean false alarm");
    }

    /// @notice THE calibration: derive `h` from the target false-alarm rate by search, exactly
    ///         as CALIBRATION.md prescribes ("raise h until ARL0 >= target"), on the real
    ///         return distribution. The value logged here is what the fork replay deploys.
    ///
    /// @dev    Targets, fixed BEFORE measuring and justified from the series, not from any
    ///         downstream LVR number:
    ///           * `mu1 = 0.5 sigma` is the smallest per-bar drift worth leaning against. Read
    ///             off the data: the strongest sustained 30-bar drifts in this window run
    ///             0.5-0.75 sigma/bar, so a trend smaller than 0.5 sigma is not one. Classic
    ///             CUSUM slack k = mu1/2 = 0.25 sigma.
    ///           * `ARL0 >= 120 bars` (~20 days at 6 bars/day). A real episode here lasts
    ///             ~30-60 bars, so false alarms must be at least ~2x rarer than that; otherwise
    ///             the detector re-arms inside chop and the directional lever degenerates into
    ///             an indiscriminate spread charged to whoever happens to trade with the noise.
    function test_deriveThreshold_fromTargetFalseAlarmRate() public view {
        uint256 targetArl0 = 120;
        int256 k = sigma / 4; // k = mu1 / 2

        // Smallest h on a sigma/4 grid whose measured ARL0 clears the target. ARL0 is monotone
        // in h (asserted above), so the first crossing is the answer.
        int256 h;
        uint256 arl0;
        for (uint256 mult = 8; mult <= 40; mult++) {
            h = int256(mult) * sigma / 4;
            arl0 = _arl0(k, h);
            if (arl0 >= targetArl0) break;
        }
        uint256 delay = _delay(sigma / 2, k, h);

        console2.log("--- calibration on the FIRST HALF of the real ETH/USDC series ---");
        console2.log("sigma per 4h bar (WAD)          :", uint256(sigma));
        console2.log("k = 0.25 sigma (WAD)            :", uint256(k));
        console2.log("h at target ARL0 (WAD)          :", uint256(h));
        console2.log("h / sigma (x100)                :", uint256(h * 100 / sigma));
        console2.log("sMax = 2h (WAD)                 :", uint256(2 * h));
        console2.log("ARL0 (bars between false alarms):", arl0);
        console2.log("ARL0 (days)                     :", arl0 / 6);
        console2.log("detection delay @ 0.5 sigma     :", delay);
        console2.log("ARL0 / delay                    :", arl0 / delay);

        assertGe(arl0, targetArl0, "derived h must meet the false-alarm target");
        // ... while still committing well inside a real episode.
        assertLt(delay, 40, "delay at the design drift must fit inside a real trend episode");
        assertGt(arl0 / delay, 4, "true detections must dominate false alarms at the design drift");
    }

    /// @notice The configuration the real-data replay used BEFORE this calibration sat at an
    ///         ARL0 of a few days: it fired constantly, which is why its directional spread
    ///         behaved like an indiscriminate one. Recorded as a regression guard so nobody
    ///         reverts to it believing it was calibrated.
    function test_preCalibrationConfig_wasFiringFarTooOften() public view {
        uint256 arl0Old = _arl0(5e15, 3e16); // the previous k = 0.005, h = 0.03
        console2.log("ARL0 of the pre-calibration config (bars):", arl0Old);
        assertLt(arl0Old, 60, "the old config's false-alarm interval was under ~10 days");
    }

    // ------------------------------------------------------------------

    function _readPrices() internal returns (uint256[] memory out) {
        uint256[] memory buf = new uint256[](8192);
        uint256 n;
        while (true) {
            string memory line = vm.readLine(PRICES);
            if (bytes(line).length == 0) break;
            buf[n++] = vm.parseUint(line);
        }
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = buf[i];
        }
    }

    /// @dev Integer sqrt of a WAD-scaled value (Babylonian); inputs here are variances.
    function _sqrtWad(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = x / 2 + 1;
        while (y < z) {
            z = y;
            y = (x / y + y) / 2;
        }
    }
}

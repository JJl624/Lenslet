package app.moyu.notes;

/** Preserve system-controlled refresh rates; numeric window votes can trigger HyperOS's app-controlled cap. */
final class RefreshRatePolicy {
    interface WindowHints {
        void adaptivePowerSavings(boolean enabled);
        void touchBoost(boolean enabled);
    }
    static void apply(int sdk,WindowHints hints){
        if(sdk<35)return;
        hints.adaptivePowerSavings(false);
        hints.touchBoost(true);
    }
}

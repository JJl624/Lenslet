package app.moyu.notes;
import org.junit.Test;
import static org.junit.Assert.*;
public class RefreshRatePolicyTest {
    private static class Hints implements RefreshRatePolicy.WindowHints {
        boolean savings=true,boost=false;int calls;
        public void adaptivePowerSavings(boolean enabled){savings=enabled;calls++;}
        public void touchBoost(boolean enabled){boost=enabled;calls++;}
    }
    @Test public void olderAndroidNeverReceivesUnsupportedWindowCalls(){
        RefreshRatePolicy.WindowHints unavailable=new RefreshRatePolicy.WindowHints(){public void adaptivePowerSavings(boolean enabled){fail("API unavailable");}public void touchBoost(boolean enabled){fail("API unavailable");}};
        for(int sdk:new int[]{29,30,34})RefreshRatePolicy.apply(sdk,unavailable);
    }
    @Test public void modernWindowsKeepTouchBoostWithoutDefaultAdaptivePowerSaving(){for(int sdk:new int[]{35,36,37}){Hints hints=new Hints();RefreshRatePolicy.apply(sdk,hints);assertFalse(hints.savings);assertTrue(hints.boost);assertEquals(2,hints.calls);}}
    @Test public void newWindowsReapplyCompatibilityWithoutADeviceRateOrModeId(){Hints first=new Hints(),recreated=new Hints();RefreshRatePolicy.apply(36,first);RefreshRatePolicy.apply(36,recreated);assertEquals(first.savings,recreated.savings);assertEquals(first.boost,recreated.boost);}
}

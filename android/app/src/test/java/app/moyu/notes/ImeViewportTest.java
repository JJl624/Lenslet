package app.moyu.notes;

import org.junit.Test;
import static org.junit.Assert.*;

public class ImeViewportTest {
    @Test public void portraitImeExcludesTheActualWebViewOriginAndDoesNotSubtractNavigationTwice(){
        assertEquals(1400,ImeViewport.visibleBottom(2200,100,2400,900));
        assertEquals(2200,ImeViewport.visibleBottom(2200,100,2400,0));
    }
    @Test public void splitWindowsAndCandidateBarsUseWindowCoordinatesRatherThanDisplayHeight(){
        assertEquals(800,ImeViewport.visibleBottom(1500,300,1900,800));
        assertEquals(650,ImeViewport.visibleBottom(1500,300,1900,950));
        assertEquals(0,ImeViewport.visibleBottom(1500,300,1900,2000));
    }
}

/grill-me

If you check right now, we have a fixed tab called "Board"

First, I want you to change its text/content to the current board I'm visualizing, essentially showing in the tab title itself (and icon) which option I picked from the dropdown menu (Sessions or Dependency Graph)

Secondly, for each terminal window in the Sessions canvas, I want to add a "maximize"/"minimize" button to the left of the "x"/close button
When clicking on this button, I want:

1. The terminal goes full screen, which means:
    1a. The section where we show tabs becomes: "{terminal_title} {is_live} {spacing} {minimize} {close}"
    1b. The tabs disappear until you minimize the terminal
2. Let's make sure the going full screen/coming back has a nice transition

---

Let's also take the opportunity to add these in:

1. I want Tab/Ctrl+Tab to cycle through tabs
2. I want Ctrl+Click on top of a terminal to drag/pan the canvas instead of selecting things in the terminal (click remains the same)


/grill-me

As of right now we have a Prompt Store when pressing Ctrl+K

I want to rename that to "Global Prompt Store" or something similar, then add a new section in the left side bar (after Plans, before Diffs) called "Prompts"

These should now be project-level prompts -- only being stored for the current workspace/project and only listed in the sidebar (for now)

These are the rules for plans:

- They open in a new tab, just like plans
- I can edit prompts in the same fashion I can edit plans (i.e. normal and Vim keybinds etc)
    - There is no review for prompts though, so it's significantly simpler
- I can drag and drop from the sidebar into the canvas' terminal window and it adds "@filename" to the prompt (like it does with plans) 


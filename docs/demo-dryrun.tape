# Layout check only. Nothing metered runs: the console's pane holds a
# placeholder. Validates that the two-pane tmux layout renders inside the
# recorder and that the pane-switch keystrokes land where intended.
Output docs/media/dryrun.gif
Set Shell zsh
Set FontSize 13
Set Width 1600
Set Height 900
Set Padding 12
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms

Hide
Type "tmux -L vhsdemo -f docs/demo.tmux.conf kill-server 2>/dev/null; clear"
Enter
Sleep 1s
Show

Type "tmux -L vhsdemo -f docs/demo.tmux.conf new-session -s demo -x 220 -y 55 'echo CONSOLE PLACEHOLDER; sleep 120' \; split-window -h -b -p 58 'opencode' \; select-pane -t 0"
Enter
Sleep 8s
Type "echo typed-into-left-pane"
Sleep 2s
Ctrl+b
Type "o"
Sleep 2s
Type "r"
Sleep 2s
Ctrl+b
Type "o"
Sleep 2s

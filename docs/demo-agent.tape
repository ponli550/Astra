# The product, recorded: an agent on the left, the owner's console on the
# right, split along the trust boundary. Left is what the agent claims,
# right is what the enclave recorded.
#
#   vhs docs/demo-agent.tape
#
# Metered. The console polls three calls every ten seconds and every tool
# call the agent makes is a real invoke, so this needs an identity with
# credits and consent granted beforehand (npm run policy:allow). The
# tmux session uses its own config so the recording does not depend on
# the operator's prefix or theme.
Output docs/media/demo-agent.gif
Output docs/media/demo-agent.mp4

Set Shell zsh
Set FontSize 13
Set Width 1600
Set Height 900
Set Padding 12
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type "tmux -L vhsdemo -f docs/demo.tmux.conf kill-server 2>/dev/null; clear"
Enter
Sleep 1s
Show

# Console on the right, agent on the left, focus on the agent.
Type "tmux -L vhsdemo -f docs/demo.tmux.conf new-session -s demo -x 220 -y 55 'npm run monitor --silent' \; split-window -h -b -p 58 'opencode' \; select-pane -t 0"
Enter
Sleep 14s

# --- 1. the agent reads under live consent ---------------------------
Type "Use the vault tools. Read record medical-1 with purpose 'clinician requested a summary'. Then tell me in two lines what it says and whether the read was served or denied."
Sleep 1s
Enter
Sleep 32s

# --- 2. the owner withdraws consent from the console -----------------
Ctrl+b
Type "o"
Sleep 1s
Type "r"
Sleep 14s

# --- 3. the same request, now refused inside the enclave -------------
Ctrl+b
Type "o"
Sleep 1s
Type "Read medical-1 again with the same purpose. Was it served or denied, and what reason did the enclave give?"
Sleep 1s
Enter
Sleep 30s

# --- 4. hold on both panes: the agent's account beside the record ----
Sleep 8s

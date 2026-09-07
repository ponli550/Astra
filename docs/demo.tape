# Terminal recording of the consent demo, for the README.
#
#   vhs docs/demo.tape
#
# Deterministic: vhs runs the commands in a headless terminal and
# encodes the frames, so the same tape produces the same recording. A
# screen capture of someone typing does not, which matters when the
# thing being demonstrated is that a refusal happens every time.
#
# The pauses are real network calls to testnet, not padding.

Output docs/media/demo.gif
Output docs/media/demo.mp4

Set Shell zsh
Set FontSize 15
Set Width 1200
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0

Hide
Type "clear"
Enter
Sleep 2s
Show

# --- 1. consent withdrawn, so nothing is assumed -------------------
Type "npm run policy:deny --silent"
Enter
Sleep 12s

# --- 2. the read is refused inside the enclave ----------------------
Type "clear && npm run invoke --silent"
Enter
Sleep 20s

# --- 3. grant consent, time-boxed ----------------------------------
Type "clear && npm run policy:allow --silent"
Enter
Sleep 12s

# --- 4. now the read is served, and the write still is not ---------
Type "clear && npm run invoke --silent"
Enter
Sleep 22s

# --- 5. the enclave's own record -----------------------------------
Type "clear && npm run audit --silent 2>&1 | tail -32"
Enter
Sleep 18s

Sleep 3s

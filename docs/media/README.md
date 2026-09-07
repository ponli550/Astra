# Generated media

Empty on purpose. The recording is generated, not committed by hand:

```bash
vhs docs/demo.tape
```

That writes `demo.gif` and `demo.mp4` here, and the tape drives real calls
against testnet, so the identity in `.env` needs credits. A run with an
exhausted balance produces a recording of `InsufficientCredit` rather than the
demo, which is worse than having no recording at all.

Check before rendering:

```bash
npm run whoami
```

The tape is re-rendered rather than edited, so the recording cannot drift away
from what the code actually does.

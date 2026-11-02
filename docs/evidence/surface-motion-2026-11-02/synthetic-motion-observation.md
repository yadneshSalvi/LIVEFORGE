# Local moving-surface browser test

This is an explicitly synthetic engine test. It is excluded from submission footage and is not a Codex-generated law. Ignored harness: `LIVEFORGE/.local/motion-browser/`; URL `http://127.0.0.1:3106/`. It imports the real `GameEngine` and `WorldRenderer` from the working branch and uses ordinary native keyboard events.

Fixture: immovable lantern at x1030, surface offsetX -230, width100, y448, lifetime1, travel -140, speed1.2. Its full path is x660–800; both ledge clearances are50 units. Courier starts at x570 in this test only.

Recorded 286 native compositor frames over10.113seconds, no capture error. After restart, waited5.38seconds (more than one complete cycle), then held D+Space for500ms, released all inputs for2300ms, then held D+Space for700ms and observed landing. The capture metadata retains action wall times and native frame timestamps.

Observed while aboard: tick509, player x755.7902834650123, y400, vx0, groundedtrue; surface x749.2, right849.2, y448, dx-1.2. This confirms transport without walking.

At end of uninterrupted capture: tick612, player x941.7805669300255, y400, vx0, groundedtrue (overlapping the foundry ledge). A subsequent220ms D input moved fully onto the ledge: x996.3633039220258, y400, groundedtrue. This additional walk is outside the ten-second take, explicitly not part of the continuous landing claim. `landed.png` shows that paused final state.

Visual inspection: tapered brass underside, mint top edge and motion lines are visible. Both ledges and complete surface travel fit the game view. No static bridge joins either side.

This check establishes local behavior for one synthetic fixture. Production generation, real candidate intent fidelity and new film capture are separate pending steps.

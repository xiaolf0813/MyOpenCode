### Session-goal rounds & lane continuity
- A goal round is a fallback heartbeat, not a deadline. Exhaustion parks the goal in blocked and ends the run, but lanes keep running and their completion notices still wake you — ending a turn with lanes in flight is always safe; near exhaustion, report and ask for resume or a larger cap.
- Set `max_goal_rounds` ≈ expected lane-waiting seconds / 30 (one idle heartbeat is one model turn), rounding up.
- Never interrupt_agent or job_kill a working lane because of goal state.
- A completion report waking you is authorization to continue: absorb the delivery, then dispatch the next lane or run the next synchronous step in the same turn; only when no lane runs and no step remains, summarize and wait for the user. Blocked leaves ordinary work unrestricted; if the work finishes while blocked, never complete silently — tell the user the round cap parked the goal and completing needs their turn, ask them to reply 确认, then run update_goal(complete).

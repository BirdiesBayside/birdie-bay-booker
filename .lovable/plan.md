# Bay 6 projector plug failure — Callum's 7pm booking

## What the logs show (Brisbane time, 18 Sep)

Bay 6 has two plugs: `192.168.4.107` (working all night) and `192.168.4.76` (the one that failed).

```text
06:00:47  192.168.4.76 turns ON/OFF successfully — last ever success
  ...     (no bay 6 activity during the day)
18:57     first ON attempt of the evening — .76 already unreachable
19:00:02  automation decision: plug_on for Callum's booking (19:00-21:00), T-3m
19:02:48  first logged failure on .76
19:02 → 19:36  13 consecutive attempts, every one:
          .107  success
          .76   TCP connect timeout to http://192.168.4.76:80 (Windows error 10060)
```

Every attempt reports "Plug ON completed: 1/2 successful" and each one took ~348 seconds
(5.8 minutes) because the failing plug is left to time out on its own.

## What this means

The plug itself is fine — as you found, the Tapo app still controls it, because the app goes
via TP-Link's cloud. The bay PC talks to plugs **locally by IP**, and nothing is answering on
`192.168.4.76` from the bay PC. Between 06:00 and 19:00 the plug stopped being reachable at
that address — almost certainly it re-joined the network and the router handed it a different
IP (DHCP lease renewal), or it landed on a different access point/VLAN. The address is
therefore not actually reserved, or the reservation isn't being honoured.

This is a network/config fault, not a code fault. But the logs also expose two real product
weaknesses worth fixing so it can't silently happen again.

## Fix — on site (you, tonight/tomorrow)

1. In the Tapo app, open the Bay 6 projector plug → Device Info → note its **current IP**.
2. In the router, create a **DHCP reservation** for that plug's MAC address so the IP is
   permanently pinned (do the same for all 12 plugs while you're in there — bay 6 is the only
   one that has drifted so far, but the rest are exposed to the same risk).
3. In the Bay Controller on the Bay 6 PC, update the projector plug's IP to the new address
   (or, if the reservation restores `.76`, power-cycle the plug and confirm).
4. Turn the plug on and off from the Bay Controller to confirm the local path works.

## Fix — in the app (what I'd change)

1. **Fail fast.** Cap each plug command at ~15 seconds instead of letting it run 5.8 minutes.
   Right now a single unreachable plug blocks the whole turn-on sequence, which is why the
   controller kept re-firing and stacking attempts.
2. **Don't report a half success as done.** When only some of a bay's plugs respond, mark the
   bay's power state as failed rather than partially on, so the dashboard and logs both show a
   problem instead of looking normal.
3. **Alert on failure.** When a plug fails at the T-3m power-on for a booking, raise it
   immediately — an admin alert (and optional SMS to you) naming the bay, the plug and the
   address, so the customer isn't the one who discovers it.
4. **Find-the-plug fallback (optional).** If a plug doesn't answer on its saved IP, scan the
   bay's subnet for Tapo devices and, if the plug is found on a new address, use it for this
   session and flag the change for you to confirm. This makes IP drift self-healing.

## Technical notes

- Failure signature: `ConnectError("tcp connect error", 192.168.4.76:80, Os { code: 10060 })`
  from `electron/tapo_control.py` via `controlPlug`.
- Timeout work sits in `turnOnPlugs` / `turnOffPlugs` in `src/pages/BayController.tsx`
  (wrap `controlPlug` in `Promise.race` with a timeout) plus the Python client's connect
  timeout.
- Partial-success handling: `logPlugControlResult` already records `allSuccessful: false` —
  the UI/state just ignores it.
- Alerting would reuse the existing customer-alert SMS path, triggered from the
  `plug_control_result` write when `allSuccessful` is false and a booking is active.
- Subnet scan already exists (`--scan` in `tapo_control.py`) so the fallback is mostly wiring.

## Scope question

Items 1-3 are small and I'd do them together. Item 4 is the bigger one — say if you want it
in the same pass or left out.

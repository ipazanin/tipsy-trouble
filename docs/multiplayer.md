# Multiplayer without external services

## Playing together

The app connects player phones directly to a host using WebRTC data channels. It remains a static GitHub Pages app, with no signaling, room directory, discovery, STUN, or TURN service. The shared-device game is the fallback when a direct connection is unavailable.

1. Start or resume a game on the host. Choose **Connect players**.
2. Select an existing player and choose **Create pairing code**. Each offer belongs to one phone and player.
3. On the guest, open **Join a game**. Scan the offer with the in-app camera, upload its QR image, or paste its code/link. Opening the offer link also starts this step.
4. Keep the guest’s reply open. On the host, choose **Read the player’s reply** and scan, upload, or paste it inside the running app. Opening a reply in a new tab cannot recover a pairing attempt held by another tab.
5. The guest enters the shared game after the connection opens and the host sends its saved turn. Repeat for other phones; up to 12 guest devices can connect, with one device per assigned player.

Keep both pages open. Offers expire after ten minutes. An oversized QR payload falls back to copying text. After the host accepts a reply, connection attempts time out after 30 seconds. Disconnect a failed phone and create a fresh offer to pair it again.

Use the same Wi-Fi or a nearby hotspot. Client isolation, firewalls, browser local-network permissions, and mDNS resolution may prevent pairing even on the same network. Internet-wide connections and universal hotspot compatibility are not promised. A short room number cannot find another browser without a rendezvous service; this implementation exchanges complete connection descriptions instead.

## Browser and offline behavior

[WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel) are supported by current Firefox, Chromium, and Safari. Pairing depends on both browsers’ connection candidates and the surrounding network. [WebRTC leaves signaling to the application](https://webrtc.org/getting-started/peer-connections), which permits manual QR/link exchange.

The QR encoder (`qrcode`) and image decoder (`jsqr`) are bundled. Native `BarcodeDetector` is not required; [Firefox does not support it](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json). Camera scanning requests video only, after an explicit button press. Denied or unavailable camera access leaves image upload and paste available. Scanning stops when completed, cancelled, hidden, or unmounted. Pairing compression uses [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream), available in current supported browsers.

Every device needs one successful online visit before offline use. The service worker caches the app, connection code, QR tools, and built-in artwork. Cached devices can pair on a functioning local network without internet; airplane mode with Wi-Fi disabled cannot carry a connection. App updates wait until local and shared games are no longer active.

## Game authority and saved state

Each guest connects only to the host. The host chooses the player assignment before creating an offer; guests cannot choose another identity in a command.

The host owns the roster, deck, random state, current card, and rules. Guests receive the visible game state and their assignment, excluding the remaining deck, seed, random state, and saved library. Current custom artwork is transferred directly as a bounded JPEG; built-in artwork is bundled on each device. Saved profile photographs stay on their original device; remote rosters show names and initials.

Only the assigned current player or host can advance a card. During a scheduled house-rule prompt, the assigned author or host can submit the rule. All house rules apply to everyone. The host persists an action to IndexedDB before publishing its revision. A failed save leaves the previous turn intact and returns a retryable rejection.

Guest commands carry the room ID, a unique command ID, and the expected revision. The host checks the connection’s assignment, phase, revision, target, and save lock. Duplicate commands cannot apply a transition twice; each connection retains the latest 256 results. Older duplicates are rejected by their stale revision. Concurrent host and guest actions share the same save lock.

Guests wait for both acknowledgement and a newer saved revision before enabling another action. After 20 seconds without confirmation, the phone disconnects and asks for pairing again to determine the saved turn. It never guesses whether the action succeeded.

Joining does not import or replace the guest’s own saved game or collection. Guest state exists only in memory. A disconnected guest retains the last received card read-only until leaving or pairing again.

## Recovery

- **Guest refresh, app close, screen suspension, or network loss:** pair again for the latest host snapshot. Background operation is not guaranteed.
- **Host refresh:** resume the game from its saved local state, then pair guests again. Peer connections cannot be serialized into a save.
- **Host ends the game:** clear its saved game and notify connected guests. If delivery is interrupted, the connection closes and guests retain a read-only last turn.
- **Host stops sharing:** keep its local game and disconnect phones.
- **Host restores a backup:** close the shared room while loading the restored game. Guests must pair with the restored host again.

There is no host migration, automatic discovery, or automatic reconnection. Another phone cannot become host from its limited public snapshot.

## Wire format and bounds

Pairing tokens use `tt1.` followed by base64url-encoded, deflated JSON: protocol version, offer/answer kind, connection identifier, expiry, and complete SDP. The host checks that an answer belongs to its pending offer. ICE gathering completes before generating either token. `RTCPeerConnection` always receives `iceServers: []`.

Tokens are limited to 16,384 characters; SDP is limited to 64 KiB. Decompression is bounded. Links put the token in the URL fragment (`#/multiplayer?pair=…`), which is not sent to GitHub Pages as a request parameter. The app removes a consumed token from the visible route. Treat pairing codes as temporary invitations and exchange them with the intended player; the app does not log their contents.

One ordered, reliable data channel carries versioned JSON envelopes. Host messages are snapshots, command results, or an ended notification. Guest messages are ready notifications or commands. Both boundaries parse unknown input, reject unsupported versions and invalid fields, and render received card/rule text as plain text.

Messages are UTF-8 encoded and split into binary frames of at most 16 KiB including the header. A logical message may contain at most 4 MiB. The send queue allows at most 32 messages or 8 MiB; buffer backpressure and assembly waits time out after 15 seconds. A receiver assembles one ordered message at a time and closes on malformed frames. These limits bound memory and prevent silent partial snapshots. See [WebRTC data-channel guidance](https://webrtc.org/getting-started/data-channels) and [message-size considerations](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).

## Validation limits

Unit tests exercise authority, save-before-broadcast, duplicate and concurrent commands, stale revisions, failed writes, acknowledgement ordering, cancellation, timeouts, bounded payloads, image transfer, and re-pairing. Browser tests use the production app for pairing and gameplay, plus an isolated transport test for large messages.

The test server binds explicitly to IPv4 loopback (`127.0.0.1`). A controlled same-port comparison in this workspace made Firefox fail before candidate gathering when the origin bound to IPv6 loopback, then pass after binding to IPv4. This is a runner-specific observation, not a general Firefox IPv6 restriction.

This workspace cannot resolve the browser-generated mDNS candidates reliably. Default Chromium/Firefox same-machine probes failed; a test-only Chromium launch flag exposing numeric host candidates allowed the transport to connect with Firefox unchanged. Automated connection tests label that diagnostic configuration explicitly. Production code does not set browser flags, and players should not change privacy settings to use the app. The [IETF mDNS candidate draft, section 4.1](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates#section-4.1) describes local resolution constraints; it is a draft, not a claim of universal browser behavior.

Physical Android/iPhone devices, normal-browser LAN pairing, hotspot combinations, camera-to-screen scanning distance, screen locking, and airplane-mode installation behavior remain unverified. Automated mobile viewports and local transport checks do not establish that hardware/network compatibility.

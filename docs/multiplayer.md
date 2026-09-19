# Multiplayer without external services

## Decision and scope

Keep the app on GitHub Pages. Use no external signaling, discovery, STUN, or TURN service. Multiplayer remains a proposed feature; shared-device offline play is implemented and remains the fallback.

Target friends on the same Wi-Fi network or hotspot. Direct connections depend on browser and network behavior: client isolation, local-network permissions, firewalls, and mDNS resolution can prevent pairing. Do not promise internet-wide connectivity or universal hotspot support. A first visit still needs internet to cache the app; offline pairing requires the app to be available on every device already.

## Why QR pairing is possible

[WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel) carry arbitrary data between browsers. Before they open, each side must exchange a session description and connection candidates. WebRTC leaves that signaling transport to the application, so a QR code or copied text can replace a signaling server. See the [WebRTC connection guide](https://webrtc.org/getting-started/peer-connections).

Configure `RTCPeerConnection` with `iceServers: []`. Wait until ICE gathering finishes and exchange the resulting local description, including its candidates. A simple room number cannot discover another browser by itself: it would require a rendezvous service or an already connected peer. A share link can carry a complete offer; the answer still needs to return to the host.

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) hosts the client but cannot run a room directory or relay. Public signaling and STUN endpoints would still be external services, even if free. TURN relays are outside the chosen scope.

## Proposed join flow

1. Host starts a game and opens **Connect a player**. The host creates one pending connection and displays its offer as a QR code, with a copyable link alternative.
2. Guest scans the offer. The app opens its pairing screen, creates the answer, and displays a response QR. For offline use, guests scan from the already cached app.
3. Host scans that response inside the running app, without navigating away from the current game. A paste-answer alternative avoids requiring a camera.
4. Both screens show the connection result. The host assigns the connected device to a player; guests cannot claim arbitrary turn permissions.
5. Repeat for each guest. Expired or cancelled offers close their pending connection. Failed attempts provide a fresh pairing attempt and access to shared-device play.

Bundle QR generation and decoding with the app. Firefox supports WebRTC, but [its native BarcodeDetector support is absent](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json), so scanning cannot depend on that API. Camera use is optional and needs permission; gameplay data channels do not require microphone access. Pairing payloads belong in the URL fragment, not a server query string.

Offer size varies with gathered candidates. [QR capacity depends on size and error correction](https://www.qrcode.com/en/about/version.html). Measure compressed payloads and real-phone scanning before choosing a single-code format; provide copy/paste for oversized payloads. Validate the payload version, role, size, and pending offer before applying a response. Do not log session descriptions or candidate addresses.

## Game ownership and recovery

Use a star topology: every guest connects to the host, with no guest-to-guest connections. The host owns the immutable roster, deck, random state, current card, and rules. Built-in artwork can be referenced by stable ID; custom images need bounded transfer and local caching.

Guests send requests, not replacement game state. Each request identifies its command and expected game revision. The host validates the connected player's permissions, ignores duplicate commands, saves the resulting transition, then sends the new revision. Only the host or current player can advance; the scheduled author can submit their permanent rule. Everyone receives the visible card and active rules.

Guest refresh or connection loss requires pairing again and receiving the current snapshot. Host refresh restores the saved game but destroys its live connections; guests must pair again. Keep the host app open and in the foreground. Host migration and background operation are outside the first version. A seed controls random draws; it does not replace synchronization or restore a network connection.

## Feasibility gate

Before implementing the room UI, prove bidirectional messages with manually exchanged complete offers and answers, no ICE servers, and normal browser settings. Then test physical Firefox/Chrome Android, Safari iPhone, and desktop hosts across home Wi-Fi and hotspots, both online and after the app is cached offline. Verify camera denial, copy/paste pairing, malformed and expired codes, simultaneous advances, failed saves, screen locking, host reload, reconnection, and custom image limits.

Local probes with Chromium 153 and Firefox 155 included every gathered candidate in the exchanged descriptions. Default same-browser and mixed-browser connections failed in both private contexts and fresh normal profiles. A temporary Chromium diagnostic flag exposing numeric host addresses allowed bidirectional messages in Chromium-to-Chromium and both mixed-browser directions, with Firefox unchanged. This points to an mDNS resolution limitation in the test environment rather than a missing signaling message. The [IETF mDNS candidate draft, section 4.1](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates#section-4.1), documents local-network resolution constraints.

These are same-machine diagnostics, not proof of reliable physical-device pairing. Do not require browser flags or weakened privacy settings from players. Keep the feature unadvertised until normal-browser LAN and hotspot validation passes.

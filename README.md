# Four

Peer-to-peer four in a row for two, played in the browser at [mco.dev/four](https://mco.dev/four/).

It is a static app with no build step: open `index.html` from any web server. The two players connect directly to each other using [PeerJS](https://peerjs.com/) (vendored in `vendor/`).

- `rules.js`: the game (dropping discs, four in a row, a full board)
- `board.js`: draws the board and turns clicks, taps and keys into moves
- `net.js`, `ice.js`: the link between the two browsers
- `app.js`: the lobby, game flow, rematches and score, chat, video and settings

This repo is mounted in [mco-gh/mco.dev](https://github.com/mco-gh/mco.dev) as a git submodule at `static/four`. After pushing a change here, update the submodule pointer there to publish it:

```bash
cd mco.dev
git submodule update --remote static/four
git commit -am "Update four"
git push
```

## Install on a phone

The app is an installable web app: `manifest.webmanifest` describes it, and `sw.js`
is a network-first service worker, so it is always current when online and still
opens offline. Nothing needs bumping on release. The icons in `icons/` are rendered
from the SVG sources by `bash build/icons/render.sh` (needs Google Chrome).

## Connecting through firewalls

Two browsers usually connect directly, with help from a public STUN server. When they
can't (mobile data, strict routers, browsers that block local connections), a TURN
relay carries the traffic. `ice.js` fetches short-lived relay credentials from
`/api/turn`, a Netlify Function in the mco.dev repo that asks Cloudflare for them;
if that isn't available it falls back to STUN only. If no route forms within 20
seconds, the app says so instead of waiting forever.

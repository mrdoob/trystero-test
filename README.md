# Multiplayer Dune Sandbox

A simple multiplayer sandbox game using [three.js](https://threejs.org/) for rendering and [Trystero](https://github.com/dmotz/trystero) for peer-to-peer multiplayer networking.

- The landscape is a procedurally generated dune.
- Each player controls a colored, low-poly icosahedron using the arrow keys.
- The host (first to join the room) receives key events from all peers, computes positions, and streams them back.

## Getting Started

1. **Install dependencies (optional, for local dev):**
   
   ```sh
   npm install
   ```

2. **Start a local server:**
   
   ```sh
   npm start
   ```
   This uses [`serve`](https://www.npmjs.com/package/serve) to run a static server.

3. **Open the game:**
   
   Go to [http://localhost:3000](http://localhost:3000) in your browser.

4. **Invite friends:**
   
   When you open the game, a unique room ID is generated and added to the URL (as a hash, e.g. `/#room-id`).
   Share this URL with friends—they will join the same room and see you in the game.

## Controls

- Arrow keys: Move your icosahedron

## Multiplayer Logic

- The host (lowest peer ID) receives key events from all clients, updates all positions, and broadcasts the state.
- Clients send their key state to the host and receive position updates.

## Features

- Dune-like procedural landscape (10x larger than before)
- Real-time multiplayer with Trystero (P2P, no server required)
- Camera follows your player
- Rolling low-poly icosahedron avatars
- Dynamic shadows, fog, and atmospheric background

## Credits

- [three.js](https://threejs.org/)
- [Trystero](https://github.com/dmotz/trystero) 
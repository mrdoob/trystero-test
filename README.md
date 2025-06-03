# Multiplayer Dune Sandbox

A simple multiplayer sandbox game using [three.js](https://threejs.org/) for rendering and [Trystero](https://github.com/dmotz/trystero) for peer-to-peer multiplayer networking.

- The landscape is a procedurally generated dune.
- Each player controls a colored, low-poly icosahedron using the arrow keys.
- The host (first to join the room) receives key events from all peers, computes positions, and streams them back.

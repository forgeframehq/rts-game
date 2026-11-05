// Dawn of Dynasties multiplayer relay.
//   wss://<host>/room/ABCD?role=host   the player who created the room
//   wss://<host>/room/ABCD?role=guest  the player who typed the code
// Each room is a Durable Object that passes every message from one phone to the other and
// tells each side when the other arrives or leaves. The game itself runs on the phones.
const CODE = /^\/room\/([A-HJ-NP-Z2-9]{4})$/;   // no I, O, 0 or 1: easy to read out loud

export default {
  async fetch(req, env) {
    const m = new URL(req.url).pathname.match(CODE);
    if (!m) return new Response('Dawn of Dynasties relay', { headers: { 'content-type': 'text/plain' } });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
  }
};

export class Room {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const role = new URL(req.url).searchParams.get('role') === 'host' ? 'host' : 'guest';
    const [client, server] = Object.values(new WebSocketPair());
    const has = r => this.state.getWebSockets(r).length > 0;
    // say why a join failed over the socket itself: the browser can't read an HTTP status
    const refuse = why => { server.accept(); server.send(JSON.stringify({ t: 'error', why })); server.close(4000, why); return new Response(null, { status: 101, webSocket: client }); };
    if (role === 'host' && has('host')) return refuse('That code is already in use. Try again.');
    if (role === 'guest' && !has('host')) return refuse('No game with that code.');
    if (role === 'guest' && has('guest')) return refuse('That game is already full.');
    this.state.acceptWebSocket(server, [role]);
    for (const o of this.state.getWebSockets()) if (o !== server) try { o.send(JSON.stringify({ t: 'peer', on: true, role })); } catch (e) { /* gone */ }
    server.send(JSON.stringify({ t: 'joined', role, peer: role === 'guest' || has('guest') && role === 'host' ? true : false }));
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) {
    for (const o of this.state.getWebSockets()) if (o !== ws) try { o.send(msg); } catch (e) { /* gone */ }
  }
  webSocketClose(ws) {
    for (const o of this.state.getWebSockets()) if (o !== ws) try { o.send(JSON.stringify({ t: 'peer', on: false })); } catch (e) { /* gone */ }
  }
  webSocketError(ws) { this.webSocketClose(ws); }
}

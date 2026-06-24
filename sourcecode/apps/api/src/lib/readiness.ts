// Liveness vs readiness. `/health` stays up for the whole process lifetime;
// `/ready` flips to 503 the moment graceful shutdown begins, so a load balancer
// drains this instance before app.close() starts tearing down connections.
let ready = true

export const isReady = () => ready
export const markNotReady = () => {
  ready = false
}

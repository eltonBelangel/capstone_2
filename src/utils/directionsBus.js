// Lets the chat screen ask the map screen to show a route inside the app.
// Chat calls requestDirections(...) and goes back; the map picks it up.
let pending = null;
const listeners = new Set();

export const requestDirections = (request) => {
  pending = request; // { kind: "spot" | "hotel" | "resto", item, lat, lng }
  listeners.forEach((fn) => fn());
};

export const takePendingDirections = () => {
  const request = pending;
  pending = null;
  return request;
};

export const onDirectionsRequest = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
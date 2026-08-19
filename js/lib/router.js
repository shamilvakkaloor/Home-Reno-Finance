// Minimal hash router. "#/dashboard" -> route "dashboard".
const routes = {};
let notFoundHandler = null;
let cleanups = [];

export function registerRoute(path, render) {
  routes[path] = render;
}

export function registerNotFound(render) {
  notFoundHandler = render;
}

export function currentPath() {
  const hash = location.hash.replace(/^#\/?/, "");
  return hash.split("?")[0] || "dashboard";
}

export function navigate(path) {
  location.hash = `/${path}`;
}

/** Pages call this from render() to register a Firestore unsubscribe (or any
 *  cleanup function) that should run the next time the route changes. */
export function addCleanup(fn) {
  cleanups.push(fn);
}

export async function renderRoute(container) {
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  cleanups = [];
  const path = currentPath();
  const render = routes[path] || notFoundHandler;
  if (render) await render(container);
}

export function onRouteChange(fn) {
  window.addEventListener("hashchange", fn);
}

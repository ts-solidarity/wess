export type Route =
  | { type: "lobby" }
  | { type: "about" }
  | { type: "terms" }
  | { type: "play" }
  | { type: "game"; id: string };

export function parseRoute(pathname: string): Route {
  if (pathname === "/play") {
    return { type: "play" };
  }

  if (pathname === "/about") {
    return { type: "about" };
  }

  if (pathname === "/terms") {
    return { type: "terms" };
  }

  const gameMatch = pathname.match(/^\/game\/([a-f0-9]+)$/i);
  if (gameMatch) {
    return { type: "game", id: gameMatch[1] };
  }

  return { type: "lobby" };
}

let currentCallback: ((route: Route) => void) | null = null;

export function navigate(path: string): void {
  history.pushState(null, "", path);
  currentCallback?.(parseRoute(path));
}

export function startRouter(onChange: (route: Route) => void): void {
  currentCallback = onChange;

  window.addEventListener("popstate", () => {
    onChange(parseRoute(window.location.pathname));
  });

  onChange(parseRoute(window.location.pathname));
}

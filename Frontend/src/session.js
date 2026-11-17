// Sliding session: the backend sends a renewed token in the X-Refresh-Token
// header while the user is active (see Backend auth.middleware.js). We store it
// so the session lasts as long as the app is used, and ends after 30 days
// without any activity.
let installed = false;

export function installSessionRefresh() {
  if (installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const renewed = response.headers.get("X-Refresh-Token");
    // Only replace a token we still hold (never resurrect a logged-out session).
    if (renewed && localStorage.getItem("token")) localStorage.setItem("token", renewed);
    return response;
  };
}

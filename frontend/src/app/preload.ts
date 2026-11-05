/** The /app chunk (screens + wallet layer). Shared by the router's lazy route and the landing
 *  page, which starts the download as soon as a visitor points at a way into the app. */
export const loadAppRoute = () => import("./AppRoute");

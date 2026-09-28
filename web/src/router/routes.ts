export const ROUTES = {
  HOME: "/",
  PERSONAL: "/personal",
  ABOUT: "/about",
  ATTACHMENTS: "/attachments",
  REMINDERS: "/reminders",
  INBOX: "/inbox",
  ARCHIVED: "/archived",
  CALENDAR: "/calendar",
  MAP: "/map",
  VIEWS: "/views",
  SETTING: "/setting",
  EXPLORE: "/explore",
  AUTH: "/auth",
  AUTH_SIGNUP: "/auth/signup",
  AUTH_ADMIN: "/auth/admin",
  AUTH_CALLBACK: "/auth/callback",
  SHARED_MEMO: "/memos/shares",
} as const;

/** Router pattern for the calendar: month and day are optional so `/calendar` can redirect. */
export const CALENDAR_ROUTE_PATTERN = `${ROUTES.CALENDAR}/:year?/:month?/:day?`;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

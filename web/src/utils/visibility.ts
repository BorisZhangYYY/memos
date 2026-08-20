export const isPublicMemoEnabled = (allowedVisibilities?: readonly string[]): boolean =>
  !allowedVisibilities?.length || allowedVisibilities.includes("PUBLIC");

/** The simplified instance policy always keeps PRIVATE and PROTECTED available. */
export const isMemoVisibilityEnabled = (visibility: string, allowedVisibilities?: readonly string[]): boolean =>
  visibility !== "PUBLIC" || isPublicMemoEnabled(allowedVisibilities);

/** Fall back safely when a user's saved default is temporarily disabled by the instance. */
export const resolveDefaultMemoVisibility = (preferredVisibility: string, allowedVisibilities?: readonly string[]): string => {
  const knownVisibility = ["PRIVATE", "PROTECTED", "PUBLIC"].includes(preferredVisibility);
  return knownVisibility && isMemoVisibilityEnabled(preferredVisibility, allowedVisibilities) ? preferredVisibility : "PRIVATE";
};

/** Anonymous Explore requires both an open instance and PUBLIC memo visibility. */
export const isAnonymousExploreEnabled = (instanceUrl: string | undefined, allowedVisibilities?: readonly string[]): boolean =>
  !!instanceUrl?.trim() && isPublicMemoEnabled(allowedVisibilities);

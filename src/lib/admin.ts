type AdminUserLike = {
  app_metadata?: Record<string, unknown> | null
  email?: string | null
} | null | undefined

export function getUserRole(user: AdminUserLike) {
  const role = user?.app_metadata?.role
  return typeof role === "string" ? role.trim().toLowerCase() : null
}

export function isAdminUser(user: AdminUserLike) {
  return getUserRole(user) === "admin"
}

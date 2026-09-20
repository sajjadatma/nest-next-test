-- Existing installations assigned dashboard access through the default customer role.
-- Remove only that legacy mapping; staff should receive the dedicated `staff` role.
DELETE FROM "RolePermission"
USING "Role", "Permission"
WHERE "RolePermission"."roleId" = "Role"."id"
  AND "RolePermission"."permissionId" = "Permission"."id"
  AND "Role"."key" = 'user'
  AND "Permission"."key" = 'dashboard:read';

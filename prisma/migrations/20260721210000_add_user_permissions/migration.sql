CREATE TABLE "UserPermission" (
  "userId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "permissionId"),
  CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

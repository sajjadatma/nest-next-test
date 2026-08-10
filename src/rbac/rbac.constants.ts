export const PermissionKey = {
  DashboardRead: 'dashboard:read',
  RolesManage: 'roles:manage',
  SystemLogsRead: 'system-logs:read',
  ShopManage: 'shop:manage',
  ShopCatalogManage: 'shop:catalog:manage',
  ShopInventoryManage: 'shop:inventory:manage',
  ShopOrdersRead: 'shop:orders:read',
  ShopOrdersFulfill: 'shop:orders:fulfill',
  ShopShippingManage: 'shop:shipping:manage',
  ShopPromotionsManage: 'shop:promotions:manage',
  ShopCommentsModerate: 'shop:comments:moderate',
  ShopAnalyticsRead: 'shop:analytics:read',
  ShopAuditRead: 'shop:audit:read',
  ConversationsRead: 'conversations:read',
  ConversationsTakeover: 'conversations:takeover',
  DemandRead: 'demand:read',
  ChannelsRead: 'channels:read',
} as const;

export const RoleKey = { User: 'user', Admin: 'admin' } as const;

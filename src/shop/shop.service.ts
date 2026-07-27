import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SaveCategoryDto, SaveProductDto } from './dto/manage-shop.dto';

const CATALOG = [
  { category: 'Everyday', categorySlug: 'everyday', name: 'Canvas Market Tote', slug: 'canvas-market-tote', description: 'A hard-wearing carryall for the market, commute, and everywhere in between.', priceMinor: 3800, stockQty: 18, imageUrl: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80' },
  { category: 'Home', categorySlug: 'home', name: 'Ridge Ceramic Mug', slug: 'ridge-ceramic-mug', description: 'A quietly tactile stoneware mug made for slow morning rituals.', priceMinor: 2600, stockQty: 24, imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80' },
  { category: 'Desk', categorySlug: 'desk', name: 'Walnut Desk Tray', slug: 'walnut-desk-tray', description: 'A clean landing place for keys, notes, and small daily essentials.', priceMinor: 5400, stockQty: 10, imageUrl: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=80' },
  { category: 'Everyday', categorySlug: 'everyday', name: 'Field Notebook Set', slug: 'field-notebook-set', description: 'Three unlined notebooks with tactile recycled covers.', priceMinor: 1800, stockQty: 40, imageUrl: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=900&q=80' },
] as const;

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(category?: string, query?: string) {
    await this.ensureCatalog();
    const products = await this.prisma.product.findMany({
      where: { isActive: true, ...(category ? { category: { slug: category } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}) },
      include: { category: { select: { name: true, slug: true } } }, orderBy: { name: 'asc' },
    });
    return products;
  }

  async categories() {
    await this.ensureCatalog();
    return this.prisma.category.findMany({ select: { name: true, slug: true, _count: { select: { products: { where: { isActive: true } } } } }, orderBy: { name: 'asc' } });
  }

  async createOrder(dto: CreateOrderDto) {
    if (!dto.items?.length) throw new BadRequestException('Your cart is empty.');
    const merged = new Map<string, number>();
    for (const item of dto.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    if ([...merged.values()].some((quantity) => quantity > 20)) throw new BadRequestException('A maximum of 20 units per product is allowed.');
    await this.ensureCatalog();
    return this.prisma.$transaction(async (tx) => {
      const ids = [...merged.keys()];
      const products = await tx.product.findMany({ where: { id: { in: ids }, isActive: true } });
      if (products.length !== ids.length) throw new BadRequestException('One or more products are no longer available.');
      const lines = ids.map((id) => ({ product: products.find((candidate) => candidate.id === id)!, quantity: merged.get(id)! }));
      const unavailable = lines.find(({ product, quantity }) => product.stockQty < quantity);
      if (unavailable) throw new BadRequestException(`${unavailable.product.name} does not have enough stock.`);
      const subtotalMinor = lines.reduce((sum, { product, quantity }) => sum + product.priceMinor * quantity, 0);
      const order = await tx.order.create({ data: {
        number: `NEST-${randomUUID().slice(0, 8).toUpperCase()}`,
        email: dto.email.toLowerCase(), subtotalMinor, shippingMinor: 0, totalMinor: subtotalMinor,
        shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
        items: { create: lines.map(({ product, quantity }) => ({ productId: product.id, productName: product.name, unitPriceMinor: product.priceMinor, quantity })) },
      }, include: { items: true } });
      await Promise.all(lines.map(({ product, quantity }) => tx.product.update({ where: { id: product.id }, data: { stockQty: { decrement: quantity } } })));
      return order;
    });
  }

  async adminOverview() {
    await this.ensureCatalog();
    const [products, orders, customers, revenue, recentOrders, categories] = await Promise.all([
      this.prisma.product.count(), this.prisma.order.count(), this.prisma.order.groupBy({ by: ['email'] }).then((rows) => rows.length),
      this.prisma.order.aggregate({ _sum: { totalMinor: true }, where: { status: { not: 'CANCELLED' } } }),
      this.prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }),
    ]);
    const catalogue = await this.prisma.product.findMany({ include: { category: true }, orderBy: { updatedAt: 'desc' } });
    return { metrics: { products, orders, customers, revenueMinor: revenue._sum.totalMinor ?? 0 }, products: catalogue, categories, orders: recentOrders };
  }

  createCategory(dto: SaveCategoryDto) { return this.prisma.category.create({ data: { name: dto.name.trim(), slug: dto.slug.trim().toLowerCase() } }); }
  updateCategory(id: string, dto: SaveCategoryDto) { return this.prisma.category.update({ where: { id }, data: { name: dto.name.trim(), slug: dto.slug.trim().toLowerCase() } }); }
  createProduct(dto: SaveProductDto) { return this.prisma.product.create({ data: { ...dto, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || null, isActive: dto.isActive ?? true } }); }
  updateProduct(id: string, dto: SaveProductDto) { return this.prisma.product.update({ where: { id }, data: { ...dto, name: dto.name.trim(), slug: dto.slug.trim().toLowerCase(), imageUrl: dto.imageUrl?.trim() || null } }); }
  updateOrderStatus(id: string, status: 'PENDING' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED') { return this.prisma.order.update({ where: { id }, data: { status } }); }

  private async ensureCatalog() {
    for (const item of CATALOG) {
      const category = await this.prisma.category.upsert({ where: { slug: item.categorySlug }, update: { name: item.category }, create: { slug: item.categorySlug, name: item.category } });
      await this.prisma.product.upsert({ where: { slug: item.slug }, update: {}, create: { name: item.name, slug: item.slug, description: item.description, priceMinor: item.priceMinor, stockQty: item.stockQty, imageUrl: item.imageUrl, categoryId: category.id } });
    }
  }
}

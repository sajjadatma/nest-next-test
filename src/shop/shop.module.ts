import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { OrderNotificationService } from './order-notification.service';

@Module({ controllers: [ShopController], providers: [ShopService, OrderNotificationService] })
export class ShopModule {}

import { ConflictException, NotFoundException } from '@nestjs/common';
import { B2bService } from './b2b.service';

const dbStub = () => ({
  company: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  companyMembership: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
});

describe('B2bService company authorization', () => {
  it('creates a company and assigns its creator as owner', async () => {
    const db = dbStub();
    db.company.create.mockResolvedValue({ id: 'company-1', name: 'Acme', slug: 'acme' });
    db.companyMembership.create.mockResolvedValue({ id: 'membership-1', role: 'OWNER' });
    db.company.findUnique.mockResolvedValue({ id: 'company-1', memberships: [] });
    const service = new B2bService(db as any, { record: vi.fn() } as any);

    await expect(service.createCompany({ name: 'Acme' }, 'user-1')).resolves.toMatchObject({ id: 'company-1' });
    expect(db.companyMembership.create).toHaveBeenCalledWith({ data: { companyId: 'company-1', userId: 'user-1', role: 'OWNER', status: 'ACTIVE' } });
  });

  it('returns 404 for a user who is not an active member', async () => {
    const db = dbStub(); db.companyMembership.findFirst.mockResolvedValue(null);
    const service = new B2bService(db as any);
    await expect(service.getMyCompany('user-1', 'company-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.company.findUnique).not.toHaveBeenCalled();
  });

  it('prevents removing the last active owner', async () => {
    const db = dbStub();
    db.companyMembership.findFirst.mockResolvedValue({ id: 'membership-1', role: 'OWNER', userId: 'user-1' });
    db.companyMembership.count.mockResolvedValue(0);
    const service = new B2bService(db as any);
    await expect(service.removeMember('company-1', 'membership-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.companyMembership.update).not.toHaveBeenCalled();
  });

  it('prevents demoting the last active owner to any non-owner role', async () => {
    const db = dbStub();
    db.companyMembership.findFirst.mockResolvedValue({ id: 'membership-1', role: 'OWNER', userId: 'user-1' });
    db.companyMembership.count.mockResolvedValue(0);
    const service = new B2bService(db as any);
    await expect(service.updateMember('company-1', 'membership-1', { role: 'ADMIN' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(db.companyMembership.update).not.toHaveBeenCalled();
  });
});

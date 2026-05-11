import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from './client.js';
import { credit_packages, type CreditPackageDoc } from './schema.js';
import { env } from '../env.js';

const now = () => new Date().toISOString().slice(0, 23).replace('T', ' ');

export type { CreditPackageDoc };

export async function getPackage(id: string): Promise<CreditPackageDoc | null> {
  const rows = await db()
    .select()
    .from(credit_packages)
    .where(eq(credit_packages.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listActivePackages(): Promise<CreditPackageDoc[]> {
  return db()
    .select()
    .from(credit_packages)
    .where(eq(credit_packages.active, true))
    .orderBy(asc(credit_packages.price_cents));
}

export async function listAllPackages(): Promise<CreditPackageDoc[]> {
  return db().select().from(credit_packages).orderBy(desc(credit_packages.created_at));
}

export type PackageInsert = {
  id?: string;
  name: string;
  credits: number;
  price_cents: number;
  currency?: string;
  active?: boolean;
};

export async function createPackage(values: PackageInsert): Promise<CreditPackageDoc> {
  const id = values.id ?? randomUUID();
  await db().insert(credit_packages).values({
    id,
    name: values.name,
    credits: values.credits,
    price_cents: values.price_cents,
    currency: (values.currency ?? env().STRIPE_CURRENCY).toLowerCase(),
    active: values.active ?? true,
  });
  const row = await getPackage(id);
  if (!row) throw new Error(`createPackage: row ${id} not found after insert`);
  return row;
}

export type PackageUpdate = Partial<{
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  active: boolean;
}>;

export async function updatePackage(
  id: string,
  values: PackageUpdate,
): Promise<CreditPackageDoc | null> {
  const set: Record<string, unknown> = { ...values, updated_at: now() };
  if (typeof values.currency === 'string') {
    set.currency = values.currency.toLowerCase();
  }
  await db().update(credit_packages).set(set).where(eq(credit_packages.id, id));
  return getPackage(id);
}

/** Soft-delete: flip active=false so historical purchase records still resolve. */
export async function deactivatePackage(id: string): Promise<void> {
  await db()
    .update(credit_packages)
    .set({ active: false, updated_at: now() })
    .where(eq(credit_packages.id, id));
}

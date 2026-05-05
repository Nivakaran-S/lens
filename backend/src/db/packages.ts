import { randomUUID } from 'node:crypto';
import { ensureIndexes, packagesCollection, type CreditPackageDoc } from './mongo.js';
import { env } from '../env.js';

const now = () => new Date().toISOString();

function strip(doc: CreditPackageDoc | null): CreditPackageDoc | null {
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const copy = { ...(doc as any) };
  delete copy._id;
  return copy as CreditPackageDoc;
}

export async function getPackage(id: string): Promise<CreditPackageDoc | null> {
  const c = await packagesCollection();
  return strip(await c.findOne({ id }));
}

export async function listActivePackages(): Promise<CreditPackageDoc[]> {
  const c = await packagesCollection();
  const cursor = c.find({ active: true }).sort({ price_cents: 1 });
  const out: CreditPackageDoc[] = [];
  for await (const p of cursor) out.push(strip(p as CreditPackageDoc) as CreditPackageDoc);
  return out;
}

export async function listAllPackages(): Promise<CreditPackageDoc[]> {
  const c = await packagesCollection();
  const cursor = c.find({}).sort({ created_at: -1 });
  const out: CreditPackageDoc[] = [];
  for await (const p of cursor) out.push(strip(p as CreditPackageDoc) as CreditPackageDoc);
  return out;
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
  const c = await packagesCollection();
  await ensureIndexes();
  const id = values.id ?? randomUUID();
  const ts = now();
  const doc: CreditPackageDoc = {
    id,
    name: values.name,
    credits: values.credits,
    price_cents: values.price_cents,
    currency: (values.currency ?? env().STRIPE_CURRENCY).toLowerCase(),
    active: values.active ?? true,
    created_at: ts,
    updated_at: ts,
  };
  await c.insertOne(doc);
  return doc;
}

export type PackageUpdate = Partial<{
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  active: boolean;
}>;

export async function updatePackage(id: string, values: PackageUpdate): Promise<CreditPackageDoc | null> {
  const c = await packagesCollection();
  const $set: Record<string, unknown> = { ...values, updated_at: now() };
  if (typeof values.currency === 'string') {
    $set.currency = values.currency.toLowerCase();
  }
  const result = await c.findOneAndUpdate({ id }, { $set }, { returnDocument: 'after' });
  return strip(result as CreditPackageDoc | null);
}

/** Soft-delete: just flip active=false so historical purchase records still resolve. */
export async function deactivatePackage(id: string): Promise<void> {
  const c = await packagesCollection();
  await c.updateOne({ id }, { $set: { active: false, updated_at: now() } });
}

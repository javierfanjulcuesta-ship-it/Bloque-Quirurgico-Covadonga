export interface ActiveUserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  deletedAt: Date | null;
}

export function isActiveUserRecord(user: ActiveUserRecord | null): user is ActiveUserRecord {
  return !!user && user.approved === true && user.deletedAt === null;
}

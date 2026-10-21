import type { Prisma, PrismaClient } from "@prisma/client";
import type { IdentityVaultField } from "@/lib/identity/patientIdentity";

type IdentityDb = PrismaClient | Prisma.TransactionClient;

/**
 * Guarda solo ciphertext. No escribe el texto en claro y no hace nada si la caja está vacía.
 * Con el flag apagado la caja llega vacía y esta función no inserta filas.
 */
export async function persistIdentityVault(
  db: IdentityDb,
  params: {
    subjectKind: string;
    subjectId: string;
    role: string;
    actorUserId?: string | null;
    vault: IdentityVaultField[];
  },
): Promise<void> {
  if (params.vault.length === 0) return;
  await db.patientIdentityRecord.createMany({
    data: params.vault.map((field) => ({
      subjectKind: params.subjectKind,
      subjectId: params.subjectId,
      fieldName: field.fieldName,
      ciphertext: field.ciphertext,
      keyVersion: field.keyVersion,
      retentionUntil: field.retentionUntil,
    })),
  });
  await db.identityAccessAudit.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      role: params.role,
      action: "store",
      subjectKind: params.subjectKind,
      subjectId: params.subjectId,
    },
  });
}

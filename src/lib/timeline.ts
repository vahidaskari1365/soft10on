import { db } from '@/lib/db'

/** ثبت رویداد تایم‌لاین بیمار — تاریخچه همیشه append-only است و با ویرایش از بین نمی‌رود */
export async function addTimeline(
  patientId: string,
  type: string,
  title: string,
  opts?: { refId?: string; actorName?: string; meta?: Record<string, unknown> }
): Promise<void> {
  try {
    await db.timelineEvent.create({
      data: {
        patientId,
        type,
        title,
        refId: opts?.refId,
        actorName: opts?.actorName,
        meta: (opts?.meta as object) ?? undefined,
      },
    })
  } catch {
    // تایم‌لاین best-effort
  }
}

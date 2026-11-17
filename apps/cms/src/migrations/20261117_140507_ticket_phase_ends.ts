import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_tickets_phases_items" ADD COLUMN "ends_at" timestamp(3) with time zone;
  ALTER TABLE "_page_tickets_v_version_phases_items" ADD COLUMN "ends_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_tickets_phases_items" DROP COLUMN "ends_at";
  ALTER TABLE "_page_tickets_v_version_phases_items" DROP COLUMN "ends_at";`)
}

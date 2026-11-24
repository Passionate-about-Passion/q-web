import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_tickets" ADD COLUMN "phases_on_sale" boolean DEFAULT true;
  ALTER TABLE "page_tickets" ADD COLUMN "phases_next_label" varchar DEFAULT 'Next up';
  ALTER TABLE "_page_tickets_v" ADD COLUMN "version_phases_on_sale" boolean DEFAULT true;
  ALTER TABLE "_page_tickets_v" ADD COLUMN "version_phases_next_label" varchar DEFAULT 'Next up';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_tickets" DROP COLUMN "phases_on_sale";
  ALTER TABLE "page_tickets" DROP COLUMN "phases_next_label";
  ALTER TABLE "_page_tickets_v" DROP COLUMN "version_phases_on_sale";
  ALTER TABLE "_page_tickets_v" DROP COLUMN "version_phases_next_label";`)
}

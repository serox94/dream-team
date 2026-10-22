// HTTP and cron only read release state. SQL migrations are an explicit operator action.
export const requiredSchema=31;
const migrations=["0001_initial.sql", "0002_rescheduled_france_2026_and_2027_plan.sql", "0003_la_plaine_profile.sql", "0004_full_system.sql", "0005_plaine2_rules_equipment.sql", "0006_wygonin_2027_research.sql", "0007_wygonin_dynamic_content.sql", "0008_wygonin_content_complete.sql", "0009_multiyear_core.sql", "0010_wygonin_2027_peg16.sql", "0011_wygonin_peg16_old11_bathymetry.sql", "0012_wygonin_peg16_current_rules.sql", "0013_wygonin_peg16_checklist.sql", "0014_miloszewskie_2027_peg33.sql", "0015_miloszewskie_maps.sql", "0016_miloszewskie_peg33_survey_steps.sql", "0017_trip_management_and_recovery.sql", "0018_private_sessions.sql", "0019_lake_research_and_categories.sql", "0020_lake_candidate_searches.sql", "0021_deeper_media.sql", "0022_deeper_ai_limits.sql", "0023_spot_sonar_context.sql", "0024_offline_sync.sql", "0025_checklist_templates.sql", "0026_participant_profiles.sql", "0027_lake_fact_locales.sql", "0028_individual_accounts.sql", "0029_audit_account_guards.sql", "0030_pro2_translations_photos.sql", "0031_research_evidence.sql"];
export async function ensureSchema(env){
 const rows=(await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')").all()).results;
 const state=Object.fromEntries(rows.map(row=>[row.key,row.value]));
 if(state.maintenance_mode==='on'||Number(state.schema_version)!==requiredSchema)throw Error('SCHEMA_OR_MAINTENANCE');
 const applied=(await env.DB.prepare('SELECT name FROM d1_migrations').all()).results;
 if(applied.length!==migrations.length||migrations.some(name=>!applied.some(row=>row.name===name)))throw Error('PARTIAL_MIGRATION_REGISTRY');
 if(env.APP_ENV==='production'&&(env.INDIVIDUAL_ACCOUNTS!=='true'||!(/^[a-f0-9]{40}$/).test(env.APP_BUILD||'')))throw Error('RELEASE_CONFIGURATION');
}

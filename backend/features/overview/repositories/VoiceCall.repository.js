/**
 * Voice Call Repository
 * Handles database queries for voice call logs
 */

let logger;
try {
  logger = require('../../../core/utils/logger');
} catch (e) {
  const loggerAdapter = require('../utils/logger');
  logger = loggerAdapter.getLogger();
}

class VoiceCallRepository {
  constructor(db) {
    this.pool = db;
  }
 
  // async getCallLogs(schema, tenantId, filters = {}, limit = 50) {
  //   const whereClauses = ['tenant_id = $1'];
  //   const values = [tenantId];
  //   let paramIndex = 2;

  //   if (filters.status) {
  //     whereClauses.push(`status = $${paramIndex}`);
  //     values.push(filters.status);
  //     paramIndex++;
  //   }
  //   if (filters.agentId) {
  //     whereClauses.push(`agent_id = $${paramIndex}`);
  //     values.push(filters.agentId);
  //     paramIndex++;
  //   }
  //   if (filters.startDate) {
  //     whereClauses.push(`started_at >= $${paramIndex}`);
  //     values.push(filters.startDate);
  //     paramIndex++;
  //   }
  //   if (filters.endDate) {
  //     whereClauses.push(`started_at <= $${paramIndex}`);
  //     values.push(filters.endDate);
  //     paramIndex++;
  //   }
  //   if (filters.userId) {
  //     whereClauses.push(`initiated_by_user_id = $${paramIndex}`);
  //     values.push(filters.userId);
  //     paramIndex++;
  //   }

  //   const query = `
  //     SELECT 
  //       vcl.id AS call_log_id,
  //       vcl.tenant_id,
  //       vcl.initiated_by_user_id,
  //       vcl.lead_id,
  //       vcl.to_country_code,
  //       vcl.to_base_number,
  //       vcl.from_number_id,
  //       vcl.agent_id,
  //       va.name AS agent_name,
  //       vcl.status,
  //       vcl.started_at,
  //       vcl.ended_at,
  //       vcl.duration_seconds,
  //       vcl.recording_url,
        
  //       vcl.cost,
  //       vcl.currency,
        
  //       vcl.campaign_id,
  //       vcl.campaign_lead_id,
  //       vcl.campaign_step_id,
  //       vcl.direction,
  //       vcl.metadata,
  //       l.first_name AS lead_first_name,
  //       l.last_name AS lead_last_name,
  //       vca.analysis
  //     FROM ${schema}.voice_call_logs vcl
  //     LEFT JOIN ${schema}.leads l ON l.id = vcl.lead_id
  //     LEFT JOIN ${schema}.voice_agents va ON va.id = vcl.agent_id AND va.tenant_id = vcl.tenant_id
  //     LEFT JOIN LATERAL (
  //       SELECT row_to_json(vca_row) AS analysis
  //       FROM ${schema}.voice_call_analysis vca_row
  //       WHERE vca_row.call_log_id = vcl.id
  //       ORDER BY vca_row.created_at DESC NULLS LAST
  //       LIMIT 1
  //     ) vca ON TRUE
  //     WHERE ${whereClauses.map(c => `vcl.${c}`).join(' AND ')}
  //     ORDER BY vcl.started_at DESC
  //     ${filters.startDate && filters.endDate ? '' : `LIMIT $${paramIndex}`}
  //   `;

  //   if (!filters.startDate || !filters.endDate) {
  //     values.push(limit);
  //   }
  //   const result = await this.pool.query(query, values);
  //   return result.rows;
  // }


async getCallLogs(schema, tenantId, filters = {}, limit = 50) {
  const whereClauses = ['vcl.tenant_id = $1'];
  const values = [tenantId];
  let paramIndex = 2;

  if (filters.status) {
    whereClauses.push(`vcl.status = $${paramIndex}`);
    values.push(filters.status);
    paramIndex++;
  }

  if (filters.agentId) {
    whereClauses.push(`vcl.agent_id = $${paramIndex}`);
    values.push(filters.agentId);
    paramIndex++;
  }

  if (filters.startDate) {
    whereClauses.push(`vcl.started_at >= $${paramIndex}`);
    values.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    whereClauses.push(`vcl.started_at <= $${paramIndex}`);
    values.push(filters.endDate);
    paramIndex++;
  }

  if (filters.userId) {
    whereClauses.push(`vcl.initiated_by_user_id = $${paramIndex}`);
    values.push(filters.userId);
    paramIndex++;
  }

  // ✅ If date filters exist
  if (filters.startDate && filters.endDate) {

    // -------- Smart Bucket Logic --------
    const diffDays =
      (new Date(filters.endDate) - new Date(filters.startDate)) /
      (1000 * 60 * 60 * 24);

    let bucket = 'day';

    if (diffDays > 30) {
      bucket = 'month';   // 👈 Yearly selection → month grouping
    }
    // ------------------------------------

    const query = `
      WITH filtered_calls AS (
        SELECT *
        FROM ${schema}.voice_call_logs vcl
        WHERE ${whereClauses.join(' AND ')}
      ),

      call_summary AS (
        SELECT 
          DATE(DATE_TRUNC('${bucket}', started_at)) AS call_date,
          COUNT(*) AS total_calls
        FROM filtered_calls
        GROUP BY DATE(DATE_TRUNC('${bucket}', started_at))
        ORDER BY call_date DESC
      ),

      call_logs AS (
        SELECT 
          fc.id,
          CONCAT(l.first_name, ' ', l.last_name) AS lead_name,
          va.name AS agent_name,
          DATE(fc.started_at) AS call_date,
          fc.duration_seconds,
          fc.status
        FROM filtered_calls fc
        LEFT JOIN ${schema}.leads l 
          ON l.id = fc.lead_id
        LEFT JOIN ${schema}.voice_agents va 
          ON va.id = fc.agent_id 
          AND va.tenant_id = fc.tenant_id
        ORDER BY fc.started_at DESC
        LIMIT 10
      )

      SELECT
        (SELECT json_agg(call_summary) FROM call_summary) AS summary,
        (SELECT json_agg(call_logs) FROM call_logs) AS logs
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  // Default behaviour
  const query = `
    SELECT 
      vcl.id,
      DATE(vcl.started_at) AS call_date,
      vcl.duration_seconds,
      vcl.status
    FROM ${schema}.voice_call_logs vcl
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY vcl.started_at DESC
    LIMIT $${paramIndex}
  `;

  values.push(limit);

  const result = await this.pool.query(query, values);
  return result.rows;
}


  async getVoiceById(schema, voiceId, tenantId) {
    const query = `
      SELECT 
        id,
        tenant_id,
        voice_name,
        description,
        voice_sample_url,
        provider,
        language,
        gender,
        is_active,
        metadata,
        created_at,
        updated_at
      FROM ${schema}.voice_agent_voices
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.pool.query(query, [voiceId, tenantId]);
    return result.rows[0] || null;
  }

  async getAvailableAgentsForUser(schema, userId, tenantId) {
    const query = `
      select * from ${schema}.voice_agents
      where tenant_id = $1 
    `;

    // Note: If you have user-specific permissions, add a JOIN to user_agent_permissions table
    // For now, all active agents are available to all users in the tenant

    const result = await this.pool.query(query, [tenantId]);
    return result.rows;
  }

}

module.exports = VoiceCallRepository;

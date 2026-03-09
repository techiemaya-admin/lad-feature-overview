const { VoiceCallRepository } = require('../repositories');

let getSchema;
try {
  ({ getSchema } = require('../../../core/utils/schemaHelper'));
} catch (e) {
  ({ getSchema } = require('../utils/schemaHelper'));
}

class CallLoggingService {
  constructor(db) {
    this.voiceCallRepository = new VoiceCallRepository(db);
  }


  async getCallLogs(tenantId, filters = {}, limit = 50) {
    const schema = getSchema({ user: { tenant_id: tenantId } });
    return this.voiceCallRepository.getCallLogs(schema, tenantId, filters, limit);
  }

}

module.exports = CallLoggingService;
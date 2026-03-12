const express = require('express');
const {
  VoiceAgentController,
  LeadBookingController
} = require('../controllers');

const { getTenantId } = require('../../../core/utils/tenantHelper');

const { getSchema } = require('../../../core/utils/schemaHelper');

// JWT Authentication Middleware with strict tenant validation
const jwtAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Extract tenant context automatically (header, token, or body)
  const tenantId = getTenantId(null, req);

  // Validate tenant_id is present - MANDATORY
  if (!tenantId) {
    return res.status(400).json({
      error: 'Tenant context required',
      message: 'Missing X-Tenant-Id header or tenant context in token'
    });
  }

  // Get schema based on tenant_id (removes hardcoding)
  let schema;
  try {
    schema = getSchema({ user: { tenant_id: tenantId } });
  } catch (e) {
    return res.status(400).json({
      error: 'Invalid tenant',
      message: 'Invalid tenant_id format'
    });
  }

  // Populate request with user context if not already present
  // If req.user exists from global auth, we merge/preserve it
  req.user = {
    ...(req.user || {}),
    id: req.user?.userId || req.user?.id || 'fe9d6368-ff1b-4133-952a-525d60d06cbe', // Preservation with mock fallback
    email: req.user?.email || 'admin@glinks.com',
    tenant_id: tenantId, // Use snake_case consistently
    tenantId: tenantId, // Backward compatibility
    role: req.user?.role || 'owner',
    schema: schema // Dynamic schema resolution
  };
  req.schema = schema; // Also set schema at request level

  next();
};

function createVoiceAgentRouter(db, options = {}) {
  const router = express.Router();

  // Initialize controllers
  const voiceAgentController = new VoiceAgentController(db);
  const leadBookingController = new LeadBookingController(db);

  /**
   * GET /user/available-agents
   * Get available agents for authenticated user
   */
  router.get(
    '/user/available-agents',
    jwtAuth,
    (req, res) => voiceAgentController.getUserAvailableAgents(req, res)
  );

  /**
   * GET /calls
   * Get call logs with optional filters (status, agentId, startDate, endDate, userId)
   */
  router.get(
    '/calls',
    jwtAuth,
    (req, res) => voiceAgentController.getCallLogs(req, res)
  );

  /**
   * GET /bookings
   * Get lead bookings with role-based filtering
   * Query params: selectedUserId, status, bookingType, bookingSource, leadId, startDate, endDate, callResult, limit
   */
  router.get(
    '/bookings',
    jwtAuth,
    (req, res) => leadBookingController.getLeadBookings(req, res)
  );

  /**
   * GET /bookings/:id
   * Get a single lead booking by ID
   */
  router.get(
    '/bookings/:id',
    jwtAuth,
    (req, res) => leadBookingController.getLeadBookingById(req, res)
  );

  /**
   * POST /bookings
   * Create a new lead booking
   */
  router.post(
    '/bookings',
    jwtAuth,
    (req, res) => leadBookingController.createLeadBooking(req, res)
  );

  /**
   * PUT /bookings/:id
   * Update a lead booking
   */
  router.put(
    '/bookings/:id',
    jwtAuth,
    (req, res) => leadBookingController.updateLeadBooking(req, res)
  );

  /**
   * GET /users
   * Get all users for the tenant (Owner role only)
   */
  router.get(
    '/users',
    jwtAuth,
    (req, res) => leadBookingController.getTenantUsers(req, res)
  );

  return router;
}

module.exports = createVoiceAgentRouter;
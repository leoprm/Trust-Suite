import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  // Insight Signals
  listInsightSignals, createInsight, getInsight, patchInsight,
  activateInsight, startSearch, markInternalFound,
  escalateExternal, markExternalFailed, escalateCorporate,
  resolveInsightHandler, cancelInsightHandler, archiveInsightHandler,
  // Internal Matches
  listInternalMatches, createInternalMatch, getCandidateSuggestions,
  patchInternalMatch, removeInternalMatch, selectMatchHandler, declineMatchHandler,
  // External Openings
  listExternalOpenings, createOpening, getOpening, patchOpening,
  openOpening, closeOpening, markEnoughHandler, markNotEnoughHandler,
  submitForReviewHandler, pauseOpeningHandler, cancelOpeningHandler,
  archiveOpeningHandler,
  // Applications
  listApplications, applyToOpening, patchApplication,
  getApplicationByIdHandler, startBasicReviewHandler, requestMoreInfoHandler,
  inviteToEndorsementHandler, acceptNextStepFullHandler, rejectApplicationHandler,
  archiveApplicationHandler,
  // Public (no auth)
  getPublicOpening, applyPubliclyHandler,
  // Corporate Referrals
  listCorporateReferrals, createReferral, patchReferral,
  contactReferral, selectReferral, rejectReferral, cancelReferral,
} from '../controllers/insightController';

const router = Router();

// ── Public routes (no auth) ──────────────────────────────────────────────────
router.get( '/public/insight-openings/:shareToken',                 getPublicOpening);
router.post('/public/insight-openings/:shareToken/apply',           applyPubliclyHandler);

router.use(authenticateJWT);

// ── Insight Signals ──────────────────────────────────────────────────────────
router.get( '/trees/:treeId/insights',                              listInsightSignals);
router.post('/trees/:treeId/insights',                              createInsight);
router.get( '/insights/:insightId',                                 getInsight);
router.patch('/insights/:insightId',                                patchInsight);
router.post('/insights/:insightId/activate',                        activateInsight);
router.post('/insights/:insightId/start-internal-search',           startSearch);
router.post('/insights/:insightId/mark-internal-solution-found',    markInternalFound);
router.post('/insights/:insightId/escalate-to-external-people',     escalateExternal);
router.post('/insights/:insightId/mark-external-people-failed',     markExternalFailed);
router.post('/insights/:insightId/escalate-to-corporate',           escalateCorporate);
router.post('/insights/:insightId/resolve',                         resolveInsightHandler);
router.post('/insights/:insightId/cancel',                          cancelInsightHandler);
router.post('/insights/:insightId/archive',                         archiveInsightHandler);

// ── Internal Matches ─────────────────────────────────────────────────────────
router.get( '/insights/:insightId/internal-matches',                listInternalMatches);
router.post('/insights/:insightId/internal-matches',                createInternalMatch);
router.get( '/insights/:insightId/internal-candidates',             getCandidateSuggestions);
router.patch('/insight-internal-matches/:matchId',                  patchInternalMatch);
router.delete('/insight-internal-matches/:matchId',                 removeInternalMatch);
router.post('/insight-internal-matches/:matchId/select',            selectMatchHandler);
router.post('/insight-internal-matches/:matchId/decline',           declineMatchHandler);

// ── External Openings ────────────────────────────────────────────────────────
router.get( '/insights/:insightId/external-openings',               listExternalOpenings);
router.post('/insights/:insightId/external-openings',               createOpening);
router.get( '/insight-openings/:openingId',                         getOpening);
router.patch('/insight-openings/:openingId',                        patchOpening);
router.post('/insight-openings/:openingId/open',                    openOpening);
router.post('/insight-openings/:openingId/close',                   closeOpening);
router.post('/insight-openings/:openingId/mark-enough-candidates',  markEnoughHandler);
router.post('/insight-openings/:openingId/mark-not-enough-candidates', markNotEnoughHandler);
router.post('/insight-openings/:openingId/submit-review',           submitForReviewHandler);
router.post('/insight-openings/:openingId/pause',                   pauseOpeningHandler);
router.post('/insight-openings/:openingId/cancel',                  cancelOpeningHandler);
router.post('/insight-openings/:openingId/archive',                 archiveOpeningHandler);

// ── External Applications ────────────────────────────────────────────────────
router.get( '/insight-openings/:openingId/applications',            listApplications);
router.post('/insight-openings/:openingId/applications',            applyToOpening);
router.get( '/insight-applications/:applicationId',                 getApplicationByIdHandler);
router.patch('/insight-applications/:applicationId',                patchApplication);
router.post('/insight-applications/:applicationId/start-basic-review',   startBasicReviewHandler);
router.post('/insight-applications/:applicationId/request-more-info',    requestMoreInfoHandler);
router.post('/insight-applications/:applicationId/invite-to-endorsement', inviteToEndorsementHandler);
router.post('/insight-applications/:applicationId/accept-next-step',     acceptNextStepFullHandler);
router.post('/insight-applications/:applicationId/reject',               rejectApplicationHandler);
router.post('/insight-applications/:applicationId/archive',              archiveApplicationHandler);

// Legacy compat aliases removed: external application state changes must use guarded handlers above.

// ── Corporate Referrals ──────────────────────────────────────────────────────
router.get( '/insights/:insightId/corporate-referrals',             listCorporateReferrals);
router.post('/insights/:insightId/corporate-referrals',             createReferral);
router.patch('/insight-corporate-referrals/:referralId',            patchReferral);
router.post('/insight-corporate-referrals/:referralId/contact',     contactReferral);
router.post('/insight-corporate-referrals/:referralId/select',      selectReferral);
router.post('/insight-corporate-referrals/:referralId/reject',      rejectReferral);
router.post('/insight-corporate-referrals/:referralId/cancel',      cancelReferral);

export default router;

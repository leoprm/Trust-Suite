import { Router } from 'express';
import {
  createTreeSandbox,
  getTreeSandbox,
  removeTreeSandbox,
  healthCheckTreeSandbox,
  searchMediaInSandbox,
  querySql,
  webSearchInSandbox,
  notebooklmAsk,
  notebooklmPodcast,
  notebooklmAddSource,
  notebooklmListSources,
  createSurvey,
  voteOnSurvey,
  getSurveyResults,
} from '../controllers/sandboxController';
import {
  execTreeSandbox,
  readTreeSandbox,
  writeTreeSandbox,
  convertTreeSandbox,
  uploadTreeSandbox,
  sandboxUpload,
  readParentTreeSandbox,
  readAncestorsTreeSandbox,
  saveTreeSkill,
  webExtractTreeSandbox,
  memoryTreeSandbox,
  historyTreeSandbox,
  tmCall,
  searchTreeSandbox,
  patchTreeSandbox,
  quotaTreeSandbox,
  chatHistoryTreeSandbox,
} from '../controllers/treeSandboxController';
import { authenticateJWT } from '../middleware/authMiddleware';
import { compactContext } from '../controllers/compactController';
import { createBranch, getConversationTree, checkoutBranch, summarizeNode } from '../controllers/conversationTreeController';

const router = Router();

// ── Public endpoints ──────────────────────────────────────────────────────────
router.get('/:id/sandbox', getTreeSandbox);
router.get('/:id/sandbox/health', healthCheckTreeSandbox);

// ── JWT-protected endpoints ───────────────────────────────────────────────────
router.post('/:id/sandbox', authenticateJWT, createTreeSandbox);
router.delete('/:id/sandbox', authenticateJWT, removeTreeSandbox);
router.post('/:id/sandbox/query', authenticateJWT, querySql);

// ── API Key-protected sandbox ops (Hermes agent calls) ────────────────────────
router.post('/:id/sandbox/exec', execTreeSandbox);
router.post('/:id/sandbox/read', readTreeSandbox);
router.post('/:id/sandbox/write', writeTreeSandbox);
router.post('/:id/sandbox/convert', convertTreeSandbox);
router.post('/:id/sandbox/upload', sandboxUpload.single('file'), uploadTreeSandbox);
router.post('/:id/sandbox/media-search', searchMediaInSandbox);
router.post('/:id/sandbox/web-search', webSearchInSandbox);
router.post('/:id/sandbox/parent/read', readParentTreeSandbox);
router.post('/:id/sandbox/ancestors/read', readAncestorsTreeSandbox);
router.post('/:id/sandbox/save-skill', saveTreeSkill);
router.post('/:id/sandbox/tm-call', tmCall);
router.post('/:id/sandbox/web-extract', webExtractTreeSandbox);
router.post('/:id/sandbox/memory', memoryTreeSandbox);
router.post('/:id/sandbox/history', historyTreeSandbox);
router.post('/:id/sandbox/compact', compactContext);
router.post('/:id/sandbox/branch', createBranch);
router.get('/:id/sandbox/tree', getConversationTree);
router.post('/:id/sandbox/checkout', checkoutBranch);
router.post('/:id/sandbox/summarize-node', summarizeNode);
router.post('/:id/sandbox/chat-history', chatHistoryTreeSandbox);
router.post('/:id/sandbox/search', searchTreeSandbox);
router.post('/:id/sandbox/patch', patchTreeSandbox);

// ── Quota endpoint (API Key-protected) ────────────────────────────────────────
router.get('/:id/sandbox/quota', quotaTreeSandbox);

// ── NotebookLM endpoints (API Key-protected, same as sandbox ops) ──────────────
router.post('/:id/notebooklm/ask', notebooklmAsk);
router.post('/:id/notebooklm/podcast', notebooklmPodcast);
router.post('/:id/notebooklm/source', notebooklmAddSource);
router.get('/:id/notebooklm/sources', notebooklmListSources);

// ── Survey endpoints (JWT-protected, tree members) ────────────────────────────
router.post('/:treeId/surveys', authenticateJWT, createSurvey);
router.post('/:treeId/surveys/:surveyId/vote', authenticateJWT, voteOnSurvey);
router.get('/:treeId/surveys/:surveyId/results', getSurveyResults);

export default router;

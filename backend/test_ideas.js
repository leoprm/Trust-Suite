const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const idea = await p.idea.findFirst({ select: { id: true, content: true } });
    console.log('Idea:', JSON.stringify(idea));
    
    const need = await p.need.findFirst({ select: { id: true, title: true } });
    console.log('Need:', JSON.stringify(need));
    
    if (idea && need) {
      const ni = await p.needIdea.create({
        data: { needId: need.id, ideaId: idea.id, matchedBy: 'AI', matchScore: 0.5 }
      });
      console.log('NeedIdea created:', JSON.stringify(ni));
    } else {
      console.log('Missing idea or need');
    }
    await p.$disconnect();
  } catch(e) {
    console.error('ERROR:', e.message, e.code, e.meta);
    await p.$disconnect().catch(() => {});
  }
})();

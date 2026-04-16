import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Portal UiX está vivo' });
});

export default router;